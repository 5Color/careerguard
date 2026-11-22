// CareerGuard 공통 타입 정의 (MCP 서버와 web-demo가 함께 사용)

/** 문장 판정: 초록(근거 일치) / 노랑(과장 의심) / 빨강(근거 없음·환각 차단) */
export type Verdict = "verified" | "exaggeration" | "hallucination";

/** 판정 주체: 1차 결정론적 코드 검증, 2차 LLM 의미 검증 */
export type VerdictSource = "code" | "llm";

export type FindingKind =
  | "number" // 수치 (%, 배, 명, 원, 개월 ...)
  | "stack" // 기술스택
  | "cert" // 자격증
  | "career" // 인턴·경력·수상·논문 등 이력 주장
  | "role" // 역할 표현 (총괄, 리드, 주도 ...)
  | "superlative" // 최초·유일·완벽 등 절대 표현
  | "semantic"; // LLM이 찾은 의미적 과장/환각

export interface Finding {
  kind: FindingKind;
  /** 초안에 등장한 원문 토큰 */
  token: string;
  /** 원본 경험에서 근거가 확인되었는가 */
  supported: boolean;
  /** 사람이 읽을 판정 근거 */
  detail: string;
  source: VerdictSource;
}

export interface SentenceResult {
  id: string;
  index: number;
  text: string;
  /** draft_text 내 시작/끝 오프셋 (하이라이트·수정안 적용용) */
  start: number;
  end: number;
  status: Verdict;
  /** 최종 판정에 기여한 주체 */
  decidedBy: VerdictSource[];
  /** 사실 주장(수치·스택·경력·역할)이 포함된 문장인가 */
  hasClaims: boolean;
  findings: Finding[];
  /** 판정 사유 (코드/LLM 근거 구분) */
  reasons: { source: VerdictSource; text: string }[];
  /** 원본 경험에서 인용한 근거 문장 */
  evidence: string[];
  /** 안전 수정안. 빈 문자열이면 "삭제 권장" */
  suggestion?: string;
  suggestionSource?: "llm" | "rule";
  suggestionNote?: string;
}

export interface VerifyStats {
  totalSentences: number;
  claimSentences: number;
  verified: number;
  exaggeration: number;
  hallucination: number;
  /** 차단된 환각 + 과장 건수 */
  blocked: number;
  /** 1차 코드 검증에서 추출·대조한 사실 주장 토큰 수 */
  claimsChecked: number;
  /** 0~100 팩트 신뢰도 */
  trustScore: number;
}

export interface LlmAttempt {
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface LlmUsage {
  /** 성공한 요청 모델 ID */
  model: string;
  /** API가 실제 응답한 모델 버전 (response.modelVersion) */
  respondedModel: string;
  /** 시도한 모델 체인 순서 */
  chain: string[];
  /** 1순위 실패 후 2순위 모델이 응답했는가 */
  fallbackUsed: boolean;
  attempts: LlmAttempt[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** 단가 미공개 모델이면 null */
  estCostUsd: number | null;
  /** 실제 API 호출 횟수 (정상 1회, 2순위 폴백 시 2회) */
  calls: number;
}

export interface LlmJdAssessment {
  id: string;
  status: Coverage;
  evidence: string;
}

export interface VerifyResult {
  sentences: SentenceResult[];
  stats: VerifyStats;
  /** hybrid = 1차 코드 + 2차 LLM, offline = 1차 결정론적 검증만 */
  mode: "hybrid" | "offline";
  fallbackReason?: string;
  llm?: LlmUsage;
  /** 오프라인 폴백 시에도 어떤 모델을 시도했는지 기록 */
  llmAttempts?: LlmAttempt[];
  /** 단일 LLM 호출에서 함께 받은 JD 평가·로드맵·총평 (build_gap_roadmap 힌트) */
  llmHints?: GapHints;
  llmSummary?: string;
  timings: { stage1Ms: number; stage2Ms: number; totalMs: number };
}

// ---------------- JD ----------------

export type RequirementCategory = "required" | "preferred";

export interface Requirement {
  id: string;
  category: RequirementCategory;
  text: string;
  /** 정규화된 기술/역량 키워드 */
  keywords: string[];
  /** all = 모두 필요, any = "A 또는 B" */
  logic: "all" | "any";
}

export interface JdMatrix {
  title: string;
  required: Requirement[];
  preferred: Requirement[];
  keywords: string[];
  source: "rule";
}

export type Coverage = "met" | "partial" | "unmet";

export interface RequirementCoverage extends Requirement {
  status: Coverage;
  matched: string[];
  missing: string[];
  evidence: string;
  source: "rule" | "llm";
}

export interface RoadmapWeek {
  week: number;
  title: string;
  focus: string[];
  actions: string[];
  deliverable: string;
}

export interface GapHints {
  jd?: LlmJdAssessment[];
  roadmap?: RoadmapWeek[];
}

export interface GapRoadmap {
  /** 0~100 JD 매칭률 (필수 2배 가중) */
  matchRate: number;
  coverage: RequirementCoverage[];
  gaps: string[];
  durationWeeks: number;
  weeks: RoadmapWeek[];
  source: "rule" | "llm";
  honestyNote: string;
}
