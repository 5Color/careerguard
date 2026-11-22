// Tool 3: build_gap_roadmap — JD 충족도(원본 경험 기준) + 부족 역량 2~4주 단기 보완 로드맵
// 룰 기반으로 항상 동작하며, verify_resume_evidence의 단일 LLM 호출이 준 힌트가 있으면 보수적으로 병합한다.
import type {
  Coverage,
  GapHints,
  GapRoadmap,
  JdMatrix,
  Requirement,
  RequirementCoverage,
  RoadmapWeek,
} from "../types.ts";
import { CERT_TERMS, CONCEPT_TERMS, STACK_TERMS, canonicalSet } from "./lexicon.ts";
import { splitSentences } from "./text.ts";

const COVERAGE_RANK: Record<Coverage, number> = { unmet: 0, partial: 1, met: 2 };

const STOPWORDS = new Set([
  "경험", "이상", "능력", "있는", "있으신", "분", "우대", "대한", "이해", "활용", "가능한", "가능", "사용",
  "보유", "보유자", "지식", "역량", "관련", "기반", "기본", "기본적인", "통한", "위한", "필수", "해당",
  "등", "및", "또는", "개발", "업무", "수행", "능숙", "원활한", "갖춘", "갖추신", "선호", "통해", "본인", "분야",
]);

function stem(token: string): string {
  return token.replace(/(으로|에서|에게|과의|와의|이나|이며|이고|하는|하고|하여|해본|을|를|이|가|은|는|에|의|과|와|로|도|만)$/, "");
}

function contentTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[^가-힣A-Za-z0-9+#]+/)
        .map(stem)
        .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
    ),
  ];
}

/** 원본 경험 기준 룰 커버리지 (초안은 근거로 쓰지 않는다) */
export function jdRuleCoverage(matrix: JdMatrix, rawExperience: string): RequirementCoverage[] {
  const rawFacts = canonicalSet(rawExperience, [...STACK_TERMS, ...CERT_TERMS]);
  const rawConcepts = canonicalSet(rawExperience, CONCEPT_TERMS);
  const rawSentences = splitSentences(rawExperience);
  const has = (kw: string) => rawFacts.has(kw) || rawConcepts.has(kw);
  const evidenceOf = (kw: string) =>
    rawSentences.find((s) => canonicalSet(s.text, [...STACK_TERMS, ...CERT_TERMS, ...CONCEPT_TERMS]).has(kw))?.text;

  return [...matrix.required, ...matrix.preferred].map((req): RequirementCoverage => {
    if (req.keywords.length) {
      const matched = req.keywords.filter(has);
      const missing = req.keywords.filter((k) => !has(k));
      let status: Coverage;
      if (req.logic === "any") status = matched.length ? "met" : "unmet";
      else status = matched.length === req.keywords.length ? "met" : matched.length ? "partial" : "unmet";
      const ev = matched.map(evidenceOf).find(Boolean);
      return {
        ...req,
        status,
        matched,
        missing: req.logic === "any" && matched.length ? [] : missing,
        evidence: ev ? `원본: "${ev}"` : "원본 경험에서 관련 근거를 찾지 못함",
        source: "rule",
      };
    }
    // 사전에 없는 역량: 내용어 겹침으로 추정
    const tokens = contentTokens(req.text);
    const matched = tokens.filter((t) => rawExperience.includes(t));
    const ratio = tokens.length ? matched.length / tokens.length : 0;
    const status: Coverage = ratio >= 0.6 ? "met" : ratio >= 0.3 ? "partial" : "unmet";
    const ev = rawSentences.find((s) => matched.some((m) => s.text.includes(m)))?.text;
    return {
      ...req,
      status,
      matched,
      missing: tokens.filter((t) => !matched.includes(t)),
      evidence: ev && status !== "unmet" ? `원본: "${ev}"` : "원본 경험에서 관련 근거를 찾지 못함",
      source: "rule",
    };
  });
}

// ---------------- 로드맵 템플릿 ----------------

interface Template {
  title: string;
  actions: string[];
  deliverable: string;
}

const TEMPLATES: Record<string, Template> = {
  Kubernetes: {
    title: "Kubernetes 기초 — 로컬 클러스터에 내 프로젝트 배포",
    actions: [
      "kind 또는 minikube로 로컬 클러스터 구성, 공식 튜토리얼(Deployment·Service) 완주",
      "기존 프로젝트의 Docker 이미지를 Deployment/Service/ConfigMap 매니페스트로 배포",
      "readiness/liveness probe와 롤링 업데이트를 직접 실습하고 장애 상황 재현",
    ],
    deliverable: "k8s 매니페스트가 포함된 GitHub 저장소 + 배포 과정 정리 블로그 글",
  },
  Docker: {
    title: "Docker로 프로젝트 컨테이너화",
    actions: [
      "기존 프로젝트에 멀티 스테이지 Dockerfile 작성, 이미지 크기 비교 기록",
      "docker compose로 앱 + DB를 한 번에 띄우는 로컬 환경 구성",
      "README에 실행 방법을 한 줄 명령으로 정리",
    ],
    deliverable: "Dockerfile·compose.yaml이 포함된 저장소",
  },
  AWS: {
    title: "AWS 프리티어로 배포 경험 만들기",
    actions: [
      "EC2(또는 Lightsail)에 기존 프로젝트 배포, 보안 그룹·도메인 설정",
      "RDS 또는 S3 중 하나를 연동하고 비용 알림(Budget) 설정",
      "배포 구조도를 그려 README에 첨부",
    ],
    deliverable: "실제 접속 가능한 배포 URL + 아키텍처 다이어그램",
  },
  "CI/CD": {
    title: "GitHub Actions로 CI/CD 파이프라인 구축",
    actions: [
      "PR마다 빌드·테스트가 도는 CI 워크플로 작성",
      "main 병합 시 자동 배포(또는 이미지 푸시)까지 연결",
      "실패 사례와 해결 과정을 기록",
    ],
    deliverable: ".github/workflows 설정 + 성공한 Actions 실행 기록",
  },
  Kafka: {
    title: "Kafka 메시징 기초 실습",
    actions: [
      "docker compose로 단일 브로커 Kafka 구성",
      "주문 이벤트 발행/구독 예제를 기존 프로젝트 도메인으로 구현",
      "컨슈머 그룹·오프셋 동작을 실험하고 정리",
    ],
    deliverable: "프로듀서/컨슈머 예제 저장소 + 실험 노트",
  },
  "테스트 코드": {
    title: "테스트 코드 작성 습관 만들기",
    actions: [
      "기존 프로젝트 핵심 서비스 로직에 단위 테스트 10개 이상 작성",
      "통합 테스트 1~2개와 테스트 커버리지 리포트 생성",
      "CI에서 테스트가 자동 실행되도록 연결",
    ],
    deliverable: "테스트 코드 PR + 커버리지 리포트 스크린샷",
  },
  "A/B 테스트": {
    title: "A/B 테스트 설계·분석 실습",
    actions: [
      "공개 A/B 테스트 데이터셋(Kaggle 등)으로 가설·지표·표본 크기 설계서 작성",
      "Python으로 전환율 차이 검정(z-test/카이제곱)과 신뢰구간 계산",
      "결과 해석과 의사결정 제안을 1페이지 리포트로 정리",
    ],
    deliverable: "분석 노트북 + 1페이지 실험 리포트",
  },
  "통계 분석": {
    title: "실무 통계 기초 다지기",
    actions: [
      "가설 검정·신뢰구간·회귀분석 핵심 개념을 무료 강의로 학습",
      "보유 프로젝트 데이터에 t-test·회귀분석을 적용해 해석",
      "통계적 유의성과 실무적 의미를 구분해 정리",
    ],
    deliverable: "통계 분석 노트북 + 개념 정리 블로그 글",
  },
  GA4: {
    title: "GA4 데모 계정으로 웹 행동 데이터 분석",
    actions: [
      "Google Analytics 데모 계정에서 이벤트·전환·퍼널 탐색 보고서 실습",
      "Google Analytics 공식 학습 과정 수료 (GAIQ 대비)",
      "유입 채널별 전환 퍼널 분석 리포트 작성",
    ],
    deliverable: "GA4 퍼널 분석 리포트 + 수료 내역",
  },
  BigQuery: {
    title: "BigQuery 공개 데이터셋으로 SQL 분석",
    actions: [
      "BigQuery 샌드박스(무료)에서 GA4 샘플 이커머스 데이터셋 조회",
      "윈도우 함수·CTE로 코호트 리텐션 쿼리 작성",
      "Looker Studio로 결과 대시보드 연결",
    ],
    deliverable: "SQL 쿼리 모음 저장소 + 대시보드 링크",
  },
  "지표 설계": {
    title: "서비스 핵심 지표(KPI) 설계 연습",
    actions: [
      "관심 서비스 1개를 골라 North Star·보조 지표 트리 설계",
      "리텐션·퍼널·코호트 지표 정의서를 작성",
      "기존 분석 프로젝트를 지표 관점으로 다시 요약",
    ],
    deliverable: "지표 정의서 + 프로젝트 회고 글",
  },
  SQL: {
    title: "SQL 실전 문제 풀이",
    actions: [
      "프로그래머스·LeetCode SQL 고득점 Kit 완주",
      "JOIN·서브쿼리·윈도우 함수별로 오답 노트 작성",
      "SQLD 기출 1회분 풀이",
    ],
    deliverable: "풀이 저장소 + 오답 노트",
  },
  Tableau: {
    title: "Tableau Public 대시보드 제작",
    actions: [
      "Tableau Public 무료 버전으로 공개 데이터 대시보드 1개 제작",
      "필터·파라미터·계산 필드 활용",
      "인사이트 3가지를 대시보드에 주석으로 정리",
    ],
    deliverable: "Tableau Public 프로필 링크",
  },
  "데이터 시각화": {
    title: "데이터 시각화 포트폴리오 보강",
    actions: [
      "기존 분석 결과를 차트 유형 원칙에 맞게 재시각화",
      "Looker Studio 또는 Tableau Public으로 대시보드 공개",
      "차트 선택 이유를 짧게 기록",
    ],
    deliverable: "대시보드 링크 + 시각화 설계 노트",
  },
  MLOps: {
    title: "MLflow로 실험 관리·모델 버전 관리",
    actions: [
      "기존 모델 학습 코드에 MLflow tracking(파라미터·지표·아티팩트) 연동",
      "모델 레지스트리에 버전 등록 후 서빙 엔드포인트로 불러오기",
      "실험 비교 결과를 표로 정리",
    ],
    deliverable: "MLflow 연동 저장소 + 실험 비교 표",
  },
  "모델 서빙": {
    title: "모델 서빙 API 구축",
    actions: [
      "FastAPI로 추론 엔드포인트 구현 및 입력 검증",
      "Docker 이미지로 패키징하고 부하 테스트(locust 등)로 지연시간 측정",
      "측정한 실제 수치만 README에 기록",
    ],
    deliverable: "서빙 API 저장소 + 실측 성능 표",
  },
  LLM: {
    title: "LLM 애플리케이션 기초 (RAG 미니 프로젝트)",
    actions: [
      "공개 문서로 임베딩·벡터 검색 기반 RAG 프로토타입 구현",
      "정답 셋 20문항으로 정확도를 직접 측정",
      "환각 사례와 개선 시도를 기록",
    ],
    deliverable: "RAG 데모 저장소 + 평가 결과 표",
  },
  RAG: {
    title: "RAG 파이프라인 미니 프로젝트",
    actions: [
      "문서 청킹·임베딩·검색·생성 단계를 직접 구현",
      "검색 품질(Recall@k)을 소규모 정답 셋으로 측정",
      "개선 전후 비교를 기록",
    ],
    deliverable: "RAG 저장소 + 평가 노트",
  },
  "Spring Boot": {
    title: "Spring Boot REST API 미니 프로젝트",
    actions: [
      "공식 가이드로 CRUD REST API 구현",
      "JPA 연관관계·트랜잭션 실습",
      "예외 처리·검증·API 문서화(Swagger) 적용",
    ],
    deliverable: "Spring Boot API 저장소",
  },
  Redis: {
    title: "Redis 캐시 적용 실습",
    actions: [
      "조회 API에 Redis 캐시를 적용하고 TTL·무효화 전략 설계",
      "적용 전후 응답 시간을 직접 측정",
      "캐시 일관성 이슈를 정리",
    ],
    deliverable: "캐시 적용 PR + 실측 비교 표",
  },
  Airflow: {
    title: "Airflow로 데이터 파이프라인 자동화",
    actions: [
      "docker compose로 Airflow 로컬 실행",
      "공공 API 수집 → 적재 → 집계 DAG 작성",
      "실패 재시도·알림 설정",
    ],
    deliverable: "DAG 코드 저장소 + 실행 화면",
  },
  영어: {
    title: "영어 기술 문서 독해·커뮤니케이션 보강",
    actions: [
      "매일 공식 문서/영문 기술 블로그 1편 읽고 요약",
      "영문 README 작성 연습",
      "어학 시험 응시 일정 확정 (점수는 취득 후에만 기재)",
    ],
    deliverable: "영문 요약 노트 + 영문 README",
  },
  "협업·커뮤니케이션": {
    title: "협업 경험을 검증 가능한 형태로 만들기",
    actions: [
      "오픈소스 good first issue 1건에 기여 시도 (이슈 코멘트·PR 과정 기록)",
      "스터디/팀 프로젝트에서 코드 리뷰 주고받기",
      "협업 과정의 갈등·해결 사례를 STAR 형식으로 정리",
    ],
    deliverable: "PR/리뷰 링크 + STAR 사례 노트",
  },
};

/** 인턴·실무 경력 요구: 허위 기재 대신 실제로 얻을 수 있는 경로만 제시 */
const CAREER_TEMPLATE: Template = {
  title: "실무형 경험 확보 경로 만들기 (경력 허위 기재 금지)",
  actions: [
    "채용연계형 인턴·현장실습·공공기관 체험형 인턴 공고를 조사해 지원 일정표 작성",
    "실제 기업 데이터/과제를 쓰는 공모전·해커톤 1건에 지원",
    "기존 프로젝트를 실사용자 피드백을 받는 형태로 공개 배포해 운영 경험 축적",
  ],
  deliverable: "지원 현황표 + 공모전 제출물 또는 운영 로그",
};

function templateFor(cov: RequirementCoverage): { key: string; t: Template } {
  for (const k of cov.missing.length ? cov.missing : cov.keywords) {
    if (TEMPLATES[k]) return { key: k, t: TEMPLATES[k] };
  }
  if (/인턴|실무|경력|현업/.test(cov.text)) return { key: "실무 경험", t: CAREER_TEMPLATE };
  const label = cov.keywords.length && cov.missing.length ? cov.missing[0] : cov.text.replace(/\s?(?:경험|능력|역량)$/, "").slice(0, 28);
  return {
    key: label,
    t: {
      title: `'${label}' 역량 보완`,
      actions: [
        `'${cov.text}' 관련 공식 문서·무료 강의로 핵심 개념 학습`,
        "기존 프로젝트에 해당 역량을 작게 적용한 미니 기능 구현",
        "학습·적용 과정을 블로그나 README에 기록",
      ],
      deliverable: "적용 코드/분석 결과 + 학습 기록 링크",
    },
  };
}

function ruleRoadmap(coverage: RequirementCoverage[]): RoadmapWeek[] {
  const gapCov = coverage
    .filter((c) => c.status !== "met")
    .sort(
      (a, b) =>
        (a.category === "required" ? 0 : 1) - (b.category === "required" ? 0 : 1) ||
        COVERAGE_RANK[a.status] - COVERAGE_RANK[b.status],
    );
  const picked: { key: string; t: Template; cov: RequirementCoverage }[] = [];
  for (const c of gapCov) {
    const { key, t } = templateFor(c);
    if (!picked.some((p) => p.key === key)) picked.push({ key, t, cov: c });
  }

  const weeks: RoadmapWeek[] = picked.slice(0, 4).map((p, i) => ({
    week: i + 1,
    title: p.t.title,
    focus: [`${p.cov.category === "required" ? "필수" : "우대"}: ${p.cov.text}`],
    actions: p.t.actions,
    deliverable: p.t.deliverable,
  }));

  const rest = picked.slice(4).map((p) => p.key);
  if (weeks.length < 2) {
    weeks.push({
      week: weeks.length + 1,
      title: weeks.length === 0 ? "강점 역량 심화 & 포트폴리오 정리" : "적용 결과 정리 & 자소서 업데이트",
      focus: ["검증 가능한 산출물로 마무리"],
      actions: [
        "이번 주까지 만든 결과물을 README·블로그에 정리",
        "자소서에는 실제 수행한 범위와 실측 수치만 반영 (미완료 항목은 '학습 중')",
        "면접 대비: 각 수치의 측정 방법과 근거 자료를 1장으로 정리",
      ],
      deliverable: "업데이트된 포트폴리오 + 근거 자료 1장",
    });
  }
  if (weeks.length < 2) {
    weeks.push({
      week: weeks.length + 1,
      title: "면접 대비 & 근거 자료 정리",
      focus: ["모든 주장에 근거 연결"],
      actions: ["자소서 문장별 근거(코드·문서·수치) 링크 표 작성", "모의 면접에서 수치 질문 대비"],
      deliverable: "문장별 근거 링크 표",
    });
  }
  if (rest.length) weeks[weeks.length - 1].focus.push(`이후 과제: ${rest.join(", ")}`);
  return weeks.map((w, i) => ({ ...w, week: i + 1 }));
}

export interface BuildGapRoadmapInput {
  matrix: JdMatrix;
  rawExperience: string;
  /** verify_resume_evidence의 단일 LLM 호출이 함께 반환한 힌트 (선택) */
  hints?: GapHints;
}

export const HONESTY_NOTE =
  "로드맵을 마치기 전에는 자소서에 해당 역량을 '경험'으로 쓰지 말고 '학습 중'으로만 기재하세요. 완료 후에도 실제로 수행한 범위와 직접 측정한 수치만 적습니다.";

export function buildGapRoadmap({ matrix, rawExperience, hints }: BuildGapRoadmapInput): GapRoadmap {
  const rule = jdRuleCoverage(matrix, rawExperience);
  const hintById = new Map((hints?.jd ?? []).map((h) => [h.id, h]));

  const coverage = rule.map((c): RequirementCoverage => {
    const h = hintById.get(c.id);
    if (!h) return c;
    // 하드 키워드(스택·자격)가 있는 요구사항: 코드 판정 우선, LLM은 더 엄격하게만
    if (c.keywords.length) {
      if (COVERAGE_RANK[h.status] < COVERAGE_RANK[c.status]) {
        return { ...c, status: h.status, evidence: h.evidence || c.evidence, source: "llm" };
      }
      return c;
    }
    // 사전에 없는 소프트 역량: LLM 의미 판단 채택
    return { ...c, status: h.status, evidence: h.evidence || c.evidence, source: "llm" };
  });

  const weight = (r: Requirement) => (r.category === "required" ? 2 : 1);
  const totalW = coverage.reduce((s, c) => s + weight(c), 0);
  const gotW = coverage.reduce((s, c) => s + weight(c) * (c.status === "met" ? 1 : c.status === "partial" ? 0.5 : 0), 0);
  const matchRate = totalW ? Math.round((gotW / totalW) * 100) : 0;

  const gaps = coverage
    .filter((c) => c.status !== "met")
    .map((c) => (c.missing.length && c.keywords.length ? c.missing.join(", ") : c.text));

  const llmWeeks = hints?.roadmap?.filter((w) => w.title && w.actions?.length) ?? [];
  const useLlm = llmWeeks.length >= 2;
  const weeks = useLlm ? llmWeeks.slice(0, 4).map((w, i) => ({ ...w, week: i + 1 })) : ruleRoadmap(coverage);

  return {
    matchRate,
    coverage,
    gaps,
    durationWeeks: weeks.length,
    weeks,
    source: useLlm ? "llm" : "rule",
    honestyNote: HONESTY_NOTE,
  };
}
