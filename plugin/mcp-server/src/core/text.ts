// 문장 분리 · 수치 주장 추출 · 원본 대조 유틸 (결정론적, LLM 비용 0원)

export interface Span {
  text: string;
  start: number;
  end: number;
}

/** 한국어 자소서를 문장 단위로 분리한다. 소수점(1.2초)·확장자(Node.js)는 분리하지 않는다. */
export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  let segStart = 0;
  const push = (endExclusive: number) => {
    const seg = text.slice(segStart, endExclusive);
    const lead = seg.length - seg.trimStart().length;
    const trimmed = seg.trim();
    if (trimmed.length > 0) {
      const start = segStart + lead;
      spans.push({ text: trimmed, start, end: start + trimmed.length });
    }
    segStart = endExclusive;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      push(i);
      segStart = i + 1;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?" || ch === "。") {
      // 연속된 종결부호/닫는 따옴표·괄호까지 포함
      let j = i + 1;
      while (j < text.length && /[.!?"'”’)\]]/.test(text[j])) j++;
      if (j >= text.length || /\s/.test(text[j])) {
        push(j);
        i = j - 1;
      }
    }
  }
  push(text.length);
  return spans;
}

// ---------------- 수치 주장 ----------------

export interface NumberClaim {
  token: string;
  value: number;
  /** 정규화 단위 (예: %, 배, 명, 원, 개월, 년, s, 건 ...) */
  unit: string;
  index: number;
  length: number;
}

const MULT: Record<string, number> = { 천: 1e3, 만: 1e4, 억: 1e8 };

const UNIT_ALIASES: Record<string, string> = {
  "%": "%",
  퍼센트: "%",
  "%p": "%p",
  배: "배",
  x: "배",
  X: "배",
  명: "명",
  인: "명",
  원: "원",
  개월: "개월",
  달: "개월",
  년: "년",
  주일: "주",
  주: "주",
  일: "일",
  시간: "s",
  분: "s",
  초: "s",
  ms: "s",
  밀리초: "s",
  건: "건",
  회: "회",
  번: "회",
  개: "개",
  곳: "곳",
  위: "위",
  등: "위",
  점: "점",
  팀: "팀",
  GB: "GB",
  MB: "MB",
  TB: "TB",
  KB: "KB",
  TPS: "TPS",
  QPS: "QPS",
  RPS: "RPS",
};

const TIME_SCALE: Record<string, number> = { 시간: 3600, 분: 60, 초: 1, ms: 0.001, 밀리초: 0.001 };

// 긴 단위가 먼저 오도록 정렬 (개월 > 개, 주일 > 주, %p > %)
const UNIT_SRC = Object.keys(UNIT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join("|");

const DIGIT_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9.\-_/])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(천|만|억)?\s*(${UNIT_SRC})?(?![A-Za-z])`,
  "g",
);

const WORD_NUM: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
  스무: 20,
};
const WORD_RE = /(?<![가-힣])(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무)\s?(배|명|개월|달)/g;

/** 텍스트에서 단위가 붙은 수치 주장을 추출한다. 단위 없는 맨 숫자는 무시(소음). */
export function extractNumberClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = [];
  DIGIT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIGIT_RE.exec(text))) {
    const [token, numRaw, multRaw, unitRaw] = m;
    if (!unitRaw && !multRaw) continue;
    if (unitRaw === "분" && text[m.index + token.length] === "기") continue; // 1분기(Q1)는 시간이 아님
    let value = parseFloat(numRaw.replace(/,/g, ""));
    if (multRaw) value *= MULT[multRaw];
    let unit = "";
    if (unitRaw) {
      unit = UNIT_ALIASES[unitRaw] ?? unitRaw;
      if (unit === "s") value *= TIME_SCALE[unitRaw] ?? 1;
      if (unit === "년" && value >= 1900 && value <= 2100) unit = "연도";
    }
    out.push({ token: token.trim(), value, unit, index: m.index, length: token.trimEnd().length });
  }
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    const unit = UNIT_ALIASES[m[2]] ?? m[2];
    out.push({ token: m[0], value: WORD_NUM[m[1]], unit, index: m.index, length: m[0].length });
  }
  return out.sort((a, b) => a.index - b.index);
}

function approxEq(a: number, b: number, rel = 0.005): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * rel);
}

export interface RawIndex {
  raw: string;
  sentences: Span[];
  claims: (NumberClaim & { sentence: number })[];
}

export function buildRawIndex(raw: string): RawIndex {
  const sentences = splitSentences(raw);
  const claims: RawIndex["claims"] = [];
  sentences.forEach((s, i) => {
    for (const c of extractNumberClaims(s.text)) claims.push({ ...c, sentence: i });
  });
  return { raw, sentences, claims };
}

export interface ClaimSupport {
  supported: boolean;
  how?: "exact" | "derived";
  detail: string;
  evidence?: string;
}

/**
 * 초안의 수치가 원본에 있는가?
 * 1) 같은 단위·같은 값이 원본에 존재 → exact
 * 2) 원본의 같은 문장 내 두 수치로부터 계산 가능 (1.2초→0.84초 = 30% 단축) → derived
 */
export function checkNumberClaim(claim: NumberClaim, idx: RawIndex): ClaimSupport {
  const sameUnit = (u: string) => claim.unit === "" || u === "" || u === claim.unit;
  for (const rc of idx.claims) {
    if (sameUnit(rc.unit) && approxEq(claim.value, rc.value)) {
      return {
        supported: true,
        how: "exact",
        detail: `수치 '${claim.token}' 원본 일치`,
        evidence: idx.sentences[rc.sentence].text,
      };
    }
  }
  // 계산 근거 (같은 원본 문장 안의 전/후 수치)
  if (claim.unit === "%" || claim.unit === "배") {
    const bySentence = new Map<number, RawIndex["claims"]>();
    for (const rc of idx.claims) {
      if (!bySentence.has(rc.sentence)) bySentence.set(rc.sentence, []);
      bySentence.get(rc.sentence)!.push(rc);
    }
    for (const [si, list] of bySentence) {
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const a = list[i];
          const b = list[j];
          if (a.unit !== b.unit || a.unit === "%" || a.unit === "배" || a.value === 0) continue;
          const pctChange = (Math.abs(a.value - b.value) / a.value) * 100;
          const ratio = b.value / a.value;
          const ok =
            claim.unit === "%"
              ? Math.abs(pctChange - claim.value) <= 1.5
              : Math.abs(ratio - claim.value) <= 0.15;
          if (ok) {
            return {
              supported: true,
              how: "derived",
              detail: `수치 '${claim.token}'은 원본 수치(${a.token} → ${b.token})로 계산 가능`,
              evidence: idx.sentences[si].text,
            };
          }
        }
      }
      // %와 배 상호 환산 (30% 단축 ≈ 1.43배 빨라짐)
      for (const rc of list) {
        if (claim.unit === "배" && rc.unit === "%" && rc.value < 100) {
          if (Math.abs(1 / (1 - rc.value / 100) - claim.value) <= 0.1 || Math.abs(1 + rc.value / 100 - claim.value) <= 0.1) {
            return {
              supported: true,
              how: "derived",
              detail: `수치 '${claim.token}'은 원본 '${rc.token}'에서 환산 가능`,
              evidence: idx.sentences[si].text,
            };
          }
        }
        if (claim.unit === "%" && rc.unit === "배" && Math.abs((rc.value - 1) * 100 - claim.value) <= 1.5) {
          return {
            supported: true,
            how: "derived",
            detail: `수치 '${claim.token}'은 원본 '${rc.token}'에서 환산 가능`,
            evidence: idx.sentences[si].text,
          };
        }
      }
    }
  }
  const sameUnitRaw = idx.claims.filter((rc) => rc.unit === claim.unit);
  return {
    supported: false,
    detail:
      sameUnitRaw.length > 0
        ? `수치 '${claim.token}'이 원본에 없음 (원본의 같은 단위 수치: ${[...new Set(sameUnitRaw.map((r) => r.token))].join(", ")})`
        : `수치 '${claim.token}'이 원본 경험에 존재하지 않음`,
  };
}

/** 원본에서 키워드가 등장하는 첫 문장을 근거로 돌려준다 */
export function findEvidenceSentence(idx: RawIndex, test: (s: string) => boolean): string | undefined {
  return idx.sentences.find((s) => test(s.text))?.text;
}
