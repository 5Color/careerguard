// Tool 1: extract_jd_matrix — JD 필수/우대 역량과 키워드를 룰 기반으로 구조화 (LLM 비용 0원)
import type { JdMatrix, Requirement, RequirementCategory } from "../types.ts";
import { CERT_TERMS, CONCEPT_TERMS, STACK_TERMS, findTerms } from "./lexicon.ts";

const REQUIRED_HEADER =
  /(자격\s?요건|필수\s?(?:요건|역량|사항|조건)?|지원\s?자격|요구\s?(?:사항|역량)|필요\s?역량|이런\s?분을\s?찾|requirements?|qualifications|must[- ]have)/i;
const PREFERRED_HEADER = /(우대\s?(?:사항|요건|역량)?|가산점|이런\s?분이면\s?더|preferred|nice[- ]to[- ]have|plus)/i;
const OTHER_HEADER =
  /(주요\s?업무|담당\s?업무|업무\s?내용|하는\s?일|responsibilit|복리\s?후생|혜택|근무\s?(?:조건|형태|지)|전형\s?절차|채용\s?절차|회사\s?소개|about|기타|제출\s?서류|마감)/i;

const BULLET = /^\s*(?:[-•·*▶▪◦●○■□✓✔]|\d+[.)]|[①-⑳])\s*/;

function isHeader(line: string): boolean {
  const body = line.replace(/^#+\s*/, "").replace(/^[\[【<(]|[\]】>):：]+$/g, "").trim();
  return body.length <= 24 && !BULLET.test(line);
}

function headerKind(line: string): RequirementCategory | "other" | null {
  const t = line.replace(/^#+\s*/, "");
  if (PREFERRED_HEADER.test(t)) return "preferred";
  if (REQUIRED_HEADER.test(t)) return "required";
  if (OTHER_HEADER.test(t)) return "other";
  return null;
}

/** 요구사항 한 줄에서 정규화 키워드 추출 (스택·자격 우선, 겹치지 않는 역량 개념 보충) */
export function requirementKeywords(text: string): string[] {
  const facts = findTerms(text, [...STACK_TERMS, ...CERT_TERMS]);
  const concepts = findTerms(text, CONCEPT_TERMS).filter(
    (c) => !facts.some((f) => c.index < f.index + f.length && f.index < c.index + c.length),
  );
  return [...new Set([...facts, ...concepts].sort((a, b) => a.index - b.index).map((h) => h.canonical))];
}

function requirementLogic(text: string, keywords: string[]): "all" | "any" {
  if (keywords.length < 2) return "all";
  if (/또는|혹은|중\s?(?:하나|1개|한\s?가지)|\bor\b|이나\s|[가-힣A-Za-z]\s?등\s?(?:의|을|를)?\s?(?:활용|사용)?\s?경험/i.test(text)) return "any";
  // "ADsP, SQLD 등" 처럼 쉼표 나열 + '등' → 하나 이상이면 충족
  if (/(?:[A-Za-z가-힣+#.()]+\s?,\s?)+[A-Za-z가-힣+#.()]+\s?등/.test(text)) return "any";
  const noSlashTerms = text.replace(/CI\/CD|A\/B/gi, "");
  if (/[A-Za-z가-힣+#.]\s?\/\s?[A-Za-z가-힣]/.test(noSlashTerms)) return "any";
  return "all";
}

export function extractJdMatrix(jdText: string): JdMatrix {
  const lines = jdText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title = "";
  let section: RequirementCategory | "other" | null = null;
  let sawHeader = false;
  const items: { category: RequirementCategory; text: string }[] = [];

  for (const line of lines) {
    const kind = headerKind(line);
    const colon = line.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
    if (colon && headerKind(colon[1])) {
      // "우대: Docker, AWS" 같은 인라인 헤더
      section = headerKind(colon[1]);
      sawHeader = true;
      if (section !== "other") {
        for (const part of colon[2].split(/[,，;]/).map((p) => p.trim()).filter(Boolean)) {
          items.push({ category: section as RequirementCategory, text: part });
        }
      }
      continue;
    }
    if (kind && isHeader(line)) {
      section = kind;
      sawHeader = true;
      continue;
    }
    if (!title && !BULLET.test(line) && section === null) {
      title = line.replace(/^#+\s*/, "");
      continue;
    }
    const text = line.replace(BULLET, "").trim();
    if (!text) continue;
    if (section === "required" || section === "preferred") {
      items.push({ category: section, text });
    } else if (!sawHeader) {
      // 헤더가 전혀 없는 JD: 줄 단위로 추정
      if (/우대|가산점|preferred|plus/i.test(text)) items.push({ category: "preferred", text });
      else if (/경험|능력|이해|가능|활용|지식|역량|보유/.test(text)) items.push({ category: "required", text });
    }
  }

  const reqs: Requirement[] = items.map((it, i) => {
    const keywords = requirementKeywords(it.text);
    return {
      id: `r${i + 1}`,
      category: it.category,
      text: it.text,
      keywords,
      logic: requirementLogic(it.text, keywords),
    };
  });

  const required = reqs.filter((r) => r.category === "required");
  const preferred = reqs.filter((r) => r.category === "preferred");
  return {
    title: title || "채용공고",
    required,
    preferred,
    keywords: [...new Set(reqs.flatMap((r) => r.keywords))],
    source: "rule",
  };
}
