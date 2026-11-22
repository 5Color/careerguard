// 서버 전용: SKILL.md 로드 → MCP Tool 3종(plugin 코어 로직) 순차 실행 → 실행 로그·지연시간·비용효율 기록
// 서브에이전트·다중 턴 루프 없음. LLM은 verify_resume_evidence 2단계에서 최대 1회(+모델 폴백 시 1회) 호출.
import "server-only";
import {
  buildGapRoadmap,
  extractJdMatrix,
  resolveLlmConfig,
  verifyEvidence,
} from "@careerguard/mcp-server/core";
import { SKILL_MD, SKILL_MD_PATH } from "@/generated/plugin-files";
import type { AnalyzeRequest, AnalyzeResult, LogStep } from "./contracts";

const KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g;
/** 로그·오류 문자열에 키가 섞여 나가지 않도록 방어적으로 가린다 */
export const redact = (s: string) => s.replace(KEY_PATTERN, "[REDACTED]");

function skillInfo() {
  const name = SKILL_MD.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "resume-factcheck";
  const guardSection = SKILL_MD.split(/^## /m).find((s) => s.startsWith("환각 차단 가드레일")) ?? "";
  const guardrails = (guardSection.match(/^\d+\.\s/gm) ?? []).length;
  return { name, chars: SKILL_MD.length, guardrails };
}

export async function runPipeline(
  req: AnalyzeRequest,
  onLog: (log: LogStep) => void = () => {},
): Promise<AnalyzeResult> {
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const logs = new Map<string, LogStep>();
  const emit = (log: LogStep) => {
    const safe = { ...log, input: redact(log.input), output: redact(log.output) };
    logs.set(log.id, safe);
    onLog(safe);
  };

  // 0) SKILL.md 로드
  const skill = skillInfo();
  emit({
    id: "skill",
    tool: "SKILL.md",
    title: "Skill 규범 로드 → 시스템 프롬프트 주입",
    status: "done",
    atMs: at(),
    durationMs: 0,
    input: SKILL_MD_PATH,
    output: `${skill.name} · ${skill.chars.toLocaleString()}자 · 환각 차단 가드레일 ${skill.guardrails}개`,
    cost: "$0",
  });

  // 1) extract_jd_matrix
  let s = performance.now();
  const jd = extractJdMatrix(req.jd);
  emit({
    id: "jd",
    tool: "extract_jd_matrix",
    title: "JD 필수/우대 역량 구조화 (룰 기반)",
    status: "done",
    atMs: at(),
    durationMs: Math.round(performance.now() - s),
    input: `JD ${req.jd.length.toLocaleString()}자`,
    output: `필수 ${jd.required.length}개 · 우대 ${jd.preferred.length}개 · 키워드 ${jd.keywords.length}개 (${jd.keywords.slice(0, 6).join(", ")}${jd.keywords.length > 6 ? " …" : ""})`,
    cost: "$0 · 코드",
  });

  // 2) verify_resume_evidence (1차 코드 → 2차 LLM)
  const forceOffline = req.mode === "offline";
  const chain = resolveLlmConfig().models;
  s = performance.now();
  const verify = await verifyEvidence({
    rawExperience: req.raw,
    draftText: req.draft,
    jdMatrix: jd,
    useLlm: !forceOffline,
    systemPrompt: SKILL_MD,
    onStage1: (info) => {
      emit({
        id: "verify-1",
        tool: "verify_resume_evidence",
        title: "1차 결정론적 코드 검증 (정규식·룰 교차 대조)",
        status: "done",
        atMs: at(),
        durationMs: info.stage1Ms,
        input: `원본 ${req.raw.length.toLocaleString()}자 · 초안 ${info.stats.totalSentences}문장`,
        output: `사실 주장 토큰 ${info.claimsChecked}개 대조 → 환각 ${info.stats.hallucination}건 즉시 차단 · 과장 의심 ${info.stats.exaggeration}건`,
        cost: "$0 · 코드",
      });
      emit({
        id: "verify-2",
        tool: "verify_resume_evidence",
        title: "2차 단일 패스 LLM 의미 검증",
        status: info.willCallLlm ? "running" : "skipped",
        atMs: at(),
        durationMs: 0,
        input: info.willCallLlm ? `모델 체인: ${info.models.join(" → ")} → 오프라인 폴백` : "LLM 호출 안 함",
        output: info.willCallLlm ? "Gemini 호출 중… (JSON Schema 강제, 1회)" : "",
        cost: info.willCallLlm ? "LLM 1회" : "$0",
      });
    },
  });

  const llm = verify.llm;
  if (verify.mode === "hybrid" && llm) {
    const attemptsNote = llm.attempts.length > 1
      ? ` · 시도: ${llm.attempts.map((a) => `${a.model}${a.ok ? " ✓" : ` ✗(${a.error})`}`).join(" → ")}`
      : "";
    emit({
      id: "verify-2",
      tool: "verify_resume_evidence",
      title: llm.fallbackUsed ? "2차 단일 패스 LLM 의미 검증 (2순위 모델 폴백)" : "2차 단일 패스 LLM 의미 검증",
      status: llm.fallbackUsed ? "fallback" : "done",
      atMs: at(),
      durationMs: verify.timings.stage2Ms,
      input: `SKILL.md 시스템 프롬프트 + 문장 ${verify.stats.totalSentences}개 + JD ${jd.required.length + jd.preferred.length}개 · 체인 ${llm.chain.join(" → ")}`,
      output: `응답 모델 ${llm.respondedModel} · 최종 환각 ${verify.stats.hallucination}건 / 과장 ${verify.stats.exaggeration}건 · 토큰 in ${llm.inputTokens.toLocaleString()} / out ${llm.outputTokens.toLocaleString()}${attemptsNote}`,
      cost: llm.estCostUsd === null ? `LLM ${llm.calls}회 · 단가 미공개 모델` : `LLM ${llm.calls}회 · ≈$${llm.estCostUsd.toFixed(5)}`,
      model: llm.respondedModel,
    });
  } else {
    const attempts = verify.llmAttempts ?? [];
    emit({
      id: "verify-2",
      tool: "verify_resume_evidence",
      title: "2차 LLM 검증 → 오프라인 결정론적 폴백",
      status: forceOffline ? "skipped" : "fallback",
      atMs: at(),
      durationMs: verify.timings.stage2Ms,
      input: attempts.length ? `시도: ${attempts.map((a) => `${a.model} ✗(${a.error})`).join(" → ")}` : "LLM 호출 없음",
      output: verify.fallbackReason ?? "1차 결정론적 검증 결과 사용",
      cost: "$0",
    });
  }

  // 3) build_gap_roadmap
  s = performance.now();
  const roadmap = buildGapRoadmap({ matrix: jd, rawExperience: req.raw, hints: verify.llmHints });
  const met = roadmap.coverage.filter((c) => c.status === "met").length;
  emit({
    id: "roadmap",
    tool: "build_gap_roadmap",
    title: "JD 갭 분석 & 2~4주 보완 로드맵",
    status: "done",
    atMs: at(),
    durationMs: Math.round(performance.now() - s),
    input: `요구사항 ${roadmap.coverage.length}개 × 원본 경험${verify.llmHints ? " + LLM 힌트(보수적 병합)" : ""}`,
    output: `매칭률 ${roadmap.matchRate}% (충족 ${met}/${roadmap.coverage.length}) · ${roadmap.durationWeeks}주 로드맵 (${roadmap.source === "llm" ? "LLM 생성" : "룰 템플릿"})`,
    cost: "$0 · 코드 (LLM 결과 재사용)",
  });

  const totalMs = at();
  const efficiency =
    verify.mode === "hybrid"
      ? `서브에이전트 미사용 · 1차 코드 검증 완료 · LLM ${llm?.calls === 1 ? "1회 호출" : `${llm?.calls}회 시도(모델 폴백)`}`
      : "서브에이전트 미사용 · 1차 코드 검증 완료 · LLM 0회 ($0)";

  return {
    jd,
    verify: {
      ...verify,
      fallbackReason: verify.fallbackReason ? redact(verify.fallbackReason) : undefined,
    },
    roadmap,
    logs: [...logs.values()],
    totalMs,
    mode: verify.mode,
    modelChain: chain,
    respondedModel: llm?.respondedModel,
    efficiency,
    skill,
  };
}
