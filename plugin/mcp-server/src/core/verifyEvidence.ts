// Tool 2: verify_resume_evidence
//  1단계 — 결정론적 코드 검증 (정규식·룰, LLM 비용 $0): 수치·기술스택·자격·경력 키워드 교차 대조 → 즉시 환각 플래그
//  2단계 — 단일 패스 LLM 의미 검증 (Gemini 1회 호출, JSON Schema): 의미적 과장 + 안전 수정안 + JD 평가 + 로드맵
//  폴백 — 키 없음/쿼터/네트워크 오류 시 1단계 결과만으로 정상 응답 (offline 모드)
import type {
  Finding,
  GapHints,
  JdMatrix,
  LlmJdAssessment,
  RoadmapWeek,
  SentenceResult,
  Verdict,
  VerifyResult,
  VerifyStats,
} from "../types.ts";
import {
  ALL_FACT_TERMS,
  ROLE_PATTERNS,
  SUPERLATIVE_PATTERNS,
  canonicalSet,
  findPatterns,
  findTerms,
} from "./lexicon.ts";
import {
  buildRawIndex,
  checkNumberClaim,
  extractNumberClaims,
  findEvidenceSentence,
  splitSentences,
  type RawIndex,
} from "./text.ts";
import { callGeminiJson, LlmError, resolveLlmConfig, type LlmConfig } from "./gemini.ts";
import { jdRuleCoverage } from "./buildGapRoadmap.ts";

/** SKILL.md를 읽지 못했을 때 쓰는 최소 가드레일 */
export const DEFAULT_GUARDRAILS = `너는 자소서 최종 팩트체커다. 원본 경험(raw_experience)만이 근거다.
- 원본에 없는 수치·기술스택·자격증·회사·인턴/경력·수상은 절대 만들지 않는다. 근거가 없으면 [확인 필요]로 표기한다.
- 1차 코드 검증의 hallucination 판정은 완화할 수 없다. 더 엄격하게만 판정한다.
- 수정안은 원본 사실만으로 다시 쓴다. 부족 역량은 허위로 채우지 않고 보완 계획으로 안내한다.`;

const SEVERITY: Record<Verdict, number> = { verified: 0, exaggeration: 1, hallucination: 2 };

export interface VerifyInput {
  rawExperience: string;
  draftText: string;
  /** extract_jd_matrix 결과. 있으면 같은 LLM 호출에서 JD 평가·로드맵까지 받는다 */
  jdMatrix?: JdMatrix;
  /** false면 LLM을 호출하지 않고 결정론적 검증만 수행 */
  useLlm?: boolean;
  llm?: LlmConfig;
  /** SKILL.md 원문 (시스템 프롬프트로 주입) */
  systemPrompt?: string;
  /** 1단계 완료 직후 호출 (실시간 로그용) */
  onStage1?: (info: { stage1Ms: number; claimsChecked: number; stats: VerifyStats; willCallLlm: boolean; models: string[] }) => void;
}

// ---------------- 1단계: 결정론적 코드 검증 ----------------

interface Hit {
  finding: Finding;
  index: number;
  length: number;
  replacement?: string;
  evidence?: string;
}

interface Stage1Sentence {
  result: SentenceResult;
  hits: Hit[];
}

interface RawContext {
  idx: RawIndex;
  terms: Set<string>;
  roles: Set<string>;
  supers: Set<string>;
  /** 원본 문장별 canonical 집합 (근거 인용용) */
  sentenceTerms: Set<string>[];
}

function buildRawContext(raw: string): RawContext {
  const idx = buildRawIndex(raw);
  return {
    idx,
    terms: canonicalSet(raw, ALL_FACT_TERMS),
    roles: new Set(findPatterns(raw, ROLE_PATTERNS).map((r) => r.canonical)),
    supers: new Set(findPatterns(raw, SUPERLATIVE_PATTERNS).map((r) => r.canonical)),
    sentenceTerms: idx.sentences.map((s) => canonicalSet(s.text, ALL_FACT_TERMS)),
  };
}

/** 원본 역할 표현 힌트 (예: "백엔드 팀원으로 참여") */
function rawRoleHint(ctx: RawContext): string | undefined {
  for (const s of ctx.idx.sentences) {
    const m = s.text.match(/[가-힣A-Za-z]+\s?(?:팀원|멤버|구성원|담당|파트)[가-힣]*\s?(?:참여|담당|맡)[가-힣]*/);
    if (m) return m[0];
  }
  return undefined;
}

function detectHits(text: string, ctx: RawContext, kinds: Set<Finding["kind"]>): Hit[] {
  const hits: Hit[] = [];
  if (kinds.has("number")) {
    for (const c of extractNumberClaims(text)) {
      const sup = checkNumberClaim(c, ctx.idx);
      let replacement: string | undefined;
      if (!sup.supported) {
        const candidates = [...new Set(ctx.idx.claims.filter((r) => r.unit === c.unit).map((r) => r.token))];
        replacement = candidates.length === 1 ? candidates[0] : `[확인 필요: ${c.token}]`;
      }
      hits.push({
        finding: { kind: "number", token: c.token, supported: sup.supported, detail: sup.detail, source: "code" },
        index: c.index,
        length: c.length,
        replacement,
        evidence: sup.evidence,
      });
    }
  }
  for (const t of findTerms(text, ALL_FACT_TERMS)) {
    const kind = t.kind === "concept" ? "stack" : t.kind;
    if (!kinds.has(kind)) continue;
    const supported = ctx.terms.has(t.canonical);
    const label = kind === "stack" ? "기술스택" : kind === "cert" ? "자격증" : "경력·실적";
    hits.push({
      finding: {
        kind,
        token: t.token,
        supported,
        detail: supported
          ? `${label} '${t.canonical}' 원본 확인`
          : `${label} '${t.token}'이(가) 원본 경험에 존재하지 않음`,
        source: "code",
      },
      index: t.index,
      length: t.length,
      replacement: supported ? undefined : `[확인 필요: ${t.token}]`,
    });
  }
  if (kinds.has("role")) {
    for (const r of findPatterns(text, ROLE_PATTERNS)) {
      const supported = ctx.roles.has(r.canonical);
      hits.push({
        finding: {
          kind: "role",
          token: r.token,
          supported,
          detail: supported
            ? `역할 표현 '${r.token}' 원본 확인`
            : `역할 표현 '${r.token}'이(가) 원본에 없음 — 역할 부풀리기 의심`,
          source: "code",
        },
        index: r.index,
        length: r.token.length,
        replacement: supported ? undefined : "[확인 필요: 실제 역할]",
      });
    }
  }
  if (kinds.has("superlative")) {
    for (const r of findPatterns(text, SUPERLATIVE_PATTERNS)) {
      const supported = ctx.supers.has(r.canonical);
      if (supported) continue;
      hits.push({
        finding: {
          kind: "superlative",
          token: r.token,
          supported: false,
          detail: `절대 표현 '${r.token}'의 근거가 원본에 없음`,
          source: "code",
        },
        index: r.index,
        length: r.token.length,
        replacement: `[확인 필요: ${r.token}]`,
      });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** 근거 없는 토큰을 치환한다. 공백만 사이에 둔 연속 치환은 하나로 합친다. */
function applyReplacements(text: string, hits: Hit[]): string {
  const reps = hits.filter((h) => !h.finding.supported && h.replacement !== undefined).sort((a, b) => a.index - b.index);
  const merged: { start: number; end: number; text: string }[] = [];
  for (const h of reps) {
    const last = merged[merged.length - 1];
    if (last && h.index < last.end) continue; // 겹침
    if (last && /^\s*$/.test(text.slice(last.end, h.index)) && last.text === h.replacement) {
      last.end = h.index + h.length;
      continue;
    }
    merged.push({ start: h.index, end: h.index + h.length, text: h.replacement! });
  }
  let out = text;
  for (const r of merged.reverse()) out = out.slice(0, r.start) + r.text + out.slice(r.end);
  return out;
}

/** 역할 부풀리기 표현을 원본 수준의 '참여' 표현으로 되돌린다 (오프라인 규칙 기반 수정안용) */
export function softenRoles(text: string): string {
  return text
    .replace(/([가-힣A-Za-z]+)\s?(?:전반을|전\s?과정을)\s?(?:이끌|리드|총괄)(었|어|며|고)/g, (_m, noun: string, end: string) =>
      `${noun}${end === "었" ? "에 참여했" : end === "어" ? "에 참여해" : end === "며" ? "에 참여하며" : "에 참여하고"}`,
    )
    .replace(/(?:을|를)\s?이끌었/g, "에 참여했")
    .replace(/(?:을|를)\s?이끌(며|고|어)/g, (_m, e: string) => (e === "어" ? "에 참여해" : `에 참여하${e}`))
    .replace(/(?:(?:총괄|주도적으로|단독으로|전담)\s?)*(?:리드|리딩|주도|총괄|전담)(하여|하며|하고|했|해|한|하)/g, "참여$1")
    .replace(/(?:을|를)\s(?=참여)/g, "에 ")
    .replace(/(팀장|리더|PM)(으로|로)서?/g, "팀원$2")
    .replace(/\s{2,}/g, " ");
}

const FACT_KINDS = new Set<Finding["kind"]>(["number", "stack", "cert", "career"]);
const ALL_KINDS = new Set<Finding["kind"]>(["number", "stack", "cert", "career", "role", "superlative"]);

function evidenceFor(hit: Hit, ctx: RawContext): string | undefined {
  if (hit.finding.kind === "number") return hit.evidence;
  if (hit.finding.kind === "role") {
    const re = ROLE_PATTERNS.find((p) => findPatterns(hit.finding.token, [p]).length > 0);
    return re ? findEvidenceSentence(ctx.idx, (s) => findPatterns(s, [re]).length > 0) : undefined;
  }
  const canon = findTerms(hit.finding.token, ALL_FACT_TERMS)[0]?.canonical;
  if (!canon) return undefined;
  const i = ctx.sentenceTerms.findIndex((set) => set.has(canon));
  return i >= 0 ? ctx.idx.sentences[i].text : undefined;
}

export function runDeterministicCheck(rawExperience: string, draftText: string) {
  const ctx = buildRawContext(rawExperience);
  const spans = splitSentences(draftText);
  let claimsChecked = 0;
  const roleHint = rawRoleHint(ctx);

  const sentences: Stage1Sentence[] = spans.map((span, i) => {
    const hits = detectHits(span.text, ctx, ALL_KINDS);
    claimsChecked += hits.length;
    const unsupportedFacts = hits.filter((h) => !h.finding.supported && FACT_KINDS.has(h.finding.kind));
    const unsupportedSoft = hits.filter((h) => !h.finding.supported && !FACT_KINDS.has(h.finding.kind));
    const supported = hits.filter((h) => h.finding.supported);

    let status: Verdict = "verified";
    const reasons: SentenceResult["reasons"] = [];
    if (unsupportedFacts.length) {
      status = "hallucination";
      for (const h of unsupportedFacts) reasons.push({ source: "code", text: h.finding.detail });
    }
    if (unsupportedSoft.length) {
      if (status === "verified") status = "exaggeration";
      for (const h of unsupportedSoft) reasons.push({ source: "code", text: h.finding.detail });
    }
    if (status === "verified") {
      if (supported.length) {
        const n = supported.filter((h) => h.finding.kind === "number").length;
        const k = supported.length - n;
        reasons.push({
          source: "code",
          text: `원본 근거 일치 — 수치 ${n}건, 스택·자격·역할 ${k}건 교차 확인`,
        });
      } else {
        reasons.push({ source: "code", text: "검증 대상 사실 주장 없음 (동기·포부 문장)" });
      }
    }

    const evidence = [
      ...new Set(hits.map((h) => (h.finding.supported ? evidenceFor(h, ctx) : undefined)).filter(Boolean) as string[]),
    ];

    const result: SentenceResult = {
      id: `s${i + 1}`,
      index: i,
      text: span.text,
      start: span.start,
      end: span.end,
      status,
      decidedBy: ["code"],
      hasClaims: hits.length > 0,
      findings: hits.map((h) => h.finding),
      reasons,
      evidence,
    };

    if (status !== "verified") {
      const careerFake = unsupportedFacts.some((h) => h.finding.kind === "career");
      if (careerFake) {
        result.suggestion = "";
        result.suggestionSource = "rule";
        result.suggestionNote = "원본에 없는 경력·실적 주장 — 문장 삭제 권장";
      } else {
        // 역할 과장은 원본 수준의 "참여" 표현으로 먼저 완화하고, 남은 근거 없는 토큰만 [확인 필요]로 치환
        const softened = unsupportedSoft.some((h) => h.finding.kind === "role") ? softenRoles(span.text) : span.text;
        result.suggestion = applyReplacements(softened, detectHits(softened, ctx, ALL_KINDS));
        result.suggestionSource = "rule";
        const notes: string[] = [];
        if (hits.some((h) => !h.finding.supported && h.finding.kind === "number" && !h.replacement?.startsWith("[")))
          notes.push("원본의 유일한 동일 단위 수치로 교체 — 문맥 확인 필요");
        if (unsupportedSoft.some((h) => h.finding.kind === "role") && roleHint)
          notes.push(`원본 역할 표현: '${roleHint}'`);
        notes.push("[확인 필요] 표시는 원본 근거를 보강하기 전까지 제출하지 마세요");
        result.suggestionNote = notes.join(" · ");
      }
    }
    return { result, hits };
  });

  return { ctx, sentences, claimsChecked };
}

/** LLM 수정안에 원본에 없는 수치·스택·경력이 섞였는지 재검증하고 [확인 필요]로 치환 */
export function sanitizeSuggestion(suggestion: string, ctx: RawContext): { text: string; changed: boolean } {
  const hits = detectHits(suggestion, ctx, FACT_KINDS).filter((h) => !h.finding.supported);
  if (!hits.length) return { text: suggestion, changed: false };
  for (const h of hits) h.replacement = `[확인 필요: ${h.finding.token}]`;
  return { text: applyReplacements(suggestion, hits), changed: true };
}

export function computeStats(sentences: SentenceResult[], claimsChecked: number): VerifyStats {
  const count = (s: Verdict) => sentences.filter((x) => x.status === s).length;
  const verified = count("verified");
  const exaggeration = count("exaggeration");
  const hallucination = count("hallucination");
  const total = sentences.length;
  const trustScore = total ? Math.round(((verified + exaggeration * 0.5) / total) * 100) : 0;
  return {
    totalSentences: total,
    claimSentences: sentences.filter((s) => s.hasClaims).length,
    verified,
    exaggeration,
    hallucination,
    blocked: exaggeration + hallucination,
    claimsChecked,
    trustScore,
  };
}

// ---------------- 2단계: 단일 패스 LLM 의미 검증 ----------------

interface LlmResponse {
  sentences: { id: string; status: Verdict; reason: string; evidence: string; suggestion: string }[];
  jd: LlmJdAssessment[];
  roadmap: { week: number; title: string; actions: string[]; deliverable: string }[];
  summary: string;
}

export const LLM_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["verified", "exaggeration", "hallucination"] },
          reason: { type: "string", description: "판정 사유 (한국어, 80자 이내)" },
          evidence: { type: "string", description: "원본 경험에서 그대로 복사한 근거 문장. 없으면 빈 문자열" },
          suggestion: { type: "string", description: "원본 사실만으로 다시 쓴 안전 수정안. verified이거나 근거 전무 시 빈 문자열" },
        },
        required: ["id", "status", "reason", "evidence", "suggestion"],
      },
    },
    jd: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["met", "partial", "unmet"] },
          evidence: { type: "string", description: "원본 기준 판단 근거 (한국어, 80자 이내)" },
        },
        required: ["id", "status", "evidence"],
      },
    },
    roadmap: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week: { type: "integer" },
          title: { type: "string" },
          actions: { type: "array", items: { type: "string" } },
          deliverable: { type: "string" },
        },
        required: ["week", "title", "actions", "deliverable"],
      },
    },
    summary: { type: "string" },
  },
  required: ["sentences", "jd", "roadmap", "summary"],
} as const;

const STATUS_KO: Record<Verdict, string> = {
  verified: "근거 일치",
  exaggeration: "과장 의심",
  hallucination: "근거 없음(환각)",
};

function buildPrompt(raw: string, stage1: Stage1Sentence[], jd?: JdMatrix): string {
  const lines: string[] = [];
  lines.push("CareerGuard 2차 단일 패스 의미 검증 요청이다. 지정된 JSON 스키마로만 응답하라.\n");
  lines.push('## 원본 경험 (raw_experience — 유일한 근거)\n"""');
  lines.push(raw);
  lines.push('"""\n');
  lines.push("## 자소서 초안 문장과 1차 결정론적 코드 검증 결과");
  for (const { result } of stage1) {
    lines.push(`[${result.id}] (code: ${result.status} / ${STATUS_KO[result.status]}) ${result.text}`);
    const notes = result.reasons.filter((r) => r.source === "code").map((r) => r.text);
    if (notes.length) lines.push(`    code_notes: ${notes.join(" | ")}`);
  }
  if (jd) {
    const cov = jdRuleCoverage(jd, raw);
    lines.push("\n## JD 요구사항 (extract_jd_matrix) 과 룰 기반 1차 충족 판정");
    for (const r of cov) {
      lines.push(
        `[${r.id}|${r.category === "required" ? "필수" : "우대"}] ${r.text} (rule: ${r.status}${r.keywords.length ? `, keywords: ${r.keywords.join(", ")}` : ""})`,
      );
    }
  }
  lines.push(`
## 작업
1. 모든 초안 문장(${stage1.map((s) => s.result.id).join(", ")})에 대해 status/reason/evidence/suggestion을 반환한다.
   - code가 hallucination이면 반드시 hallucination을 유지한다 (완화 금지).
   - 원본 사실은 있으나 역할·범위·성과 정도를 부풀리면 exaggeration (예: 팀원 → 총괄 리드, 참여 → 주도).
   - 원본에 근거가 전혀 없는 사실 주장은 hallucination.
   - evidence는 원본에서 글자 그대로 복사한 한 문장. 없으면 "".
   - suggestion: verified면 "". 그 외에는 원본 사실만으로 다시 쓴 자연스러운 한 문장. 원본에 근거가 전혀 없는 문장이면 "".
     원본에 없는 수치·스택·경력은 절대 넣지 말고, 꼭 필요하면 [확인 필요]로 표기한다.
2. ${jd ? "모든 JD 요구사항에 대해 원본 경험 기준 met/partial/unmet과 근거를 반환한다. 초안에만 있는 내용은 근거가 아니다." : "JD가 없으므로 jd는 빈 배열로 반환한다."}
3. 미충족·부분 충족 역량을 실제로 채우는 2~4주 로드맵 (week는 1부터, 주차별 title, 구체적 actions 2~4개, 검증 가능한 deliverable). 허위 경력을 만드는 방법은 금지.
4. summary: 지원자에게 주는 2문장 총평.`);
  return lines.join("\n");
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clampRoadmap(weeks: LlmResponse["roadmap"]): RoadmapWeek[] {
  return weeks
    .filter((w) => w && w.title)
    .slice(0, 4)
    .map((w, i) => ({
      week: i + 1,
      title: w.title,
      focus: [],
      actions: (w.actions ?? []).filter(Boolean).slice(0, 5),
      deliverable: w.deliverable ?? "",
    }));
}

export async function verifyEvidence(input: VerifyInput): Promise<VerifyResult> {
  const tStart = performance.now();
  const { ctx, sentences: stage1, claimsChecked } = runDeterministicCheck(input.rawExperience, input.draftText);
  const stage1Ms = Math.round(performance.now() - tStart);

  const base = (): VerifyResult => {
    const sentences = stage1.map((s) => s.result);
    return {
      sentences,
      stats: computeStats(sentences, claimsChecked),
      mode: "offline",
      timings: { stage1Ms, stage2Ms: 0, totalMs: Math.round(performance.now() - tStart) },
    };
  };

  const { apiKey, models } = resolveLlmConfig(input.llm);
  const willCallLlm = input.useLlm !== false && !!apiKey && stage1.length > 0;
  input.onStage1?.({
    stage1Ms,
    claimsChecked,
    stats: computeStats(stage1.map((s) => s.result), claimsChecked),
    willCallLlm,
    models,
  });

  if (input.useLlm === false) {
    return { ...base(), fallbackReason: "사용자가 오프라인 결정론적 모드를 선택함" };
  }
  if (!apiKey) {
    return { ...base(), fallbackReason: "GEMINI_API_KEY 미설정 — 1차 결정론적 검증 결과만 제공" };
  }
  if (stage1.length === 0) return base();

  const t2 = performance.now();
  try {
    const res = await callGeminiJson<LlmResponse>({
      systemInstruction: `${input.systemPrompt ?? DEFAULT_GUARDRAILS}\n\n응답은 반드시 지정된 JSON 스키마를 따른다. 모든 텍스트는 한국어로 쓴다.`,
      prompt: buildPrompt(input.rawExperience, stage1, input.jdMatrix),
      schema: LLM_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      config: input.llm,
    });
    const stage2Ms = Math.round(performance.now() - t2);
    const byId = new Map((res.data.sentences ?? []).map((s) => [s.id, s]));
    const rawNorm = normalizeWs(input.rawExperience);

    const merged: SentenceResult[] = stage1.map(({ result }) => {
      const r: SentenceResult = { ...result, reasons: [...result.reasons], findings: [...result.findings], evidence: [...result.evidence] };
      const llm = byId.get(r.id);
      if (!llm || !(llm.status in SEVERITY)) return r;

      const codeSev = SEVERITY[r.status];
      const llmSev = SEVERITY[llm.status];
      if (llmSev > codeSev) {
        r.status = llm.status;
        r.decidedBy = ["code", "llm"];
        r.findings.push({ kind: "semantic", token: r.text.slice(0, 24), supported: false, detail: llm.reason, source: "llm" });
      } else if (llmSev === codeSev) {
        r.decidedBy = ["code", "llm"];
      }
      if (llm.reason) {
        const suffix = llmSev < codeSev ? " (코드 판정 우선 원칙에 따라 완화하지 않음)" : "";
        r.reasons.push({ source: "llm", text: llm.reason + suffix });
      }
      // LLM이 인용한 근거가 실제 원본에 있는지 검사 — 지어낸 인용은 버린다
      if (llm.evidence && rawNorm.includes(normalizeWs(llm.evidence)) && !r.evidence.includes(llm.evidence)) {
        r.evidence.push(llm.evidence);
      }
      if (r.status === "verified") {
        delete r.suggestion;
        delete r.suggestionSource;
        delete r.suggestionNote;
      } else if (llm.suggestion && llm.suggestion.trim()) {
        const safe = sanitizeSuggestion(llm.suggestion.trim(), ctx);
        r.suggestion = safe.text;
        r.suggestionSource = "llm";
        r.suggestionNote = safe.changed
          ? "LLM 수정안에서 원본에 없는 토큰을 코드가 재검증해 [확인 필요]로 치환함"
          : "원본 근거만으로 재작성된 LLM 수정안 (코드 재검증 통과)";
      } else if (r.suggestion === undefined) {
        r.suggestion = "";
        r.suggestionSource = "llm";
        r.suggestionNote = "원본 근거가 없어 문장 삭제 권장";
      }
      return r;
    });

    const hints: GapHints = {
      jd: (res.data.jd ?? []).filter((j) => j && j.id && ["met", "partial", "unmet"].includes(j.status)),
      roadmap: clampRoadmap(res.data.roadmap ?? []),
    };
    return {
      sentences: merged,
      stats: computeStats(merged, claimsChecked),
      mode: "hybrid",
      llm: {
        model: res.model,
        respondedModel: res.respondedModel,
        chain: resolveLlmConfig(input.llm).models,
        fallbackUsed: res.fallbackUsed,
        attempts: res.attempts.map(({ model, ok, latencyMs, error }) => ({ model, ok, latencyMs, error })),
        latencyMs: res.latencyMs,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        estCostUsd: res.estCostUsd,
        calls: res.attempts.length,
      },
      llmHints: hints,
      llmSummary: res.data.summary,
      timings: { stage1Ms, stage2Ms, totalMs: Math.round(performance.now() - tStart) },
    };
  } catch (err) {
    const reason = err instanceof LlmError ? err.message : "Gemini 호출 중 알 수 없는 오류";
    const out = base();
    out.timings.stage2Ms = Math.round(performance.now() - t2);
    return {
      ...out,
      fallbackReason: `${reason} — 1차 결정론적 검증 결과로 대체`,
      llmAttempts:
        err instanceof LlmError
          ? err.attempts.map(({ model, ok, latencyMs, error }) => ({ model, ok, latencyMs, error }))
          : undefined,
    };
  }
}
