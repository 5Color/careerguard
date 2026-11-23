// 결정론적 검증에 쓰는 사전(lexicon). LLM 없이 0원으로 동작하는 1차 검증의 핵심 데이터.

export type TermKind = "stack" | "cert" | "career" | "concept";

export interface TermDef {
  canonical: string;
  kind: TermKind;
  /** 문자열(영문은 단어 경계, 한글은 부분 일치) 또는 정규식 */
  aliases: (string | RegExp)[];
  /** 이 용어가 원본에 있으면 함께 근거로 인정되는 상위 용어 (예: Spring Boot → Spring) */
  parents?: string[];
}

const S = (canonical: string, aliases: (string | RegExp)[], parents?: string[]): TermDef => ({
  canonical,
  kind: "stack",
  aliases: [canonical, ...aliases],
  parents,
});
const C = (canonical: string, aliases: (string | RegExp)[]): TermDef => ({
  canonical,
  kind: "cert",
  aliases: [canonical, ...aliases],
});
const K = (canonical: string, aliases: (string | RegExp)[]): TermDef => ({
  canonical,
  kind: "career",
  aliases,
});
const P = (canonical: string, aliases: (string | RegExp)[]): TermDef => ({
  canonical,
  kind: "concept",
  aliases: [canonical, ...aliases],
});

/** 기술스택 사전 */
export const STACK_TERMS: TermDef[] = [
  // 언어
  S("Java", [/자바(?!\s?스크립트)/]),
  S("Kotlin", ["코틀린"]),
  S("Python", ["파이썬"]),
  S("JavaScript", ["자바스크립트", "JS"]),
  S("TypeScript", ["타입스크립트", "TS"]),
  { canonical: "Go", kind: "stack", aliases: ["Golang", /Go\s?언어/g] },
  S("C++", ["cpp"]),
  S("C#", []),
  { canonical: "R", kind: "stack", aliases: [/(?<![A-Za-z])R\s?언어/g, "RStudio"] },
  S("SQL", []),
  // 백엔드
  S("Spring", ["스프링"]),
  S("Spring Boot", ["SpringBoot", "스프링 부트", "스프링부트"], ["Spring", "Java"]),
  S("JPA", ["Hibernate"], ["Spring"]),
  S("QueryDSL", [], ["JPA"]),
  S("MyBatis", ["마이바티스"]),
  S("Node.js", ["NodeJS"]),
  S("Express", ["Express.js"], ["Node.js"]),
  S("NestJS", ["Nest.js"], ["Node.js", "TypeScript"]),
  S("Django", ["장고"], ["Python"]),
  S("FastAPI", [], ["Python"]),
  S("Flask", ["플라스크"], ["Python"]),
  S("gRPC", []),
  S("GraphQL", []),
  S("REST API", ["RESTful", "REST"]),
  S("WebSocket", ["웹소켓"]),
  // 프론트
  S("React", ["리액트"]),
  S("Next.js", ["NextJS"], ["React"]),
  S("Vue", ["Vue.js"]),
  // DB/메시징
  S("MySQL", ["마이에스큐엘"], ["SQL"]),
  S("PostgreSQL", ["Postgres", "포스트그레스"], ["SQL"]),
  S("Oracle", ["오라클"], ["SQL"]),
  S("MongoDB", ["몽고DB", "몽고디비"]),
  S("Redis", ["레디스"]),
  S("Elasticsearch", ["엘라스틱서치", "ElasticSearch"]),
  S("Kafka", ["카프카"]),
  S("RabbitMQ", []),
  // 인프라/DevOps
  S("Docker", ["도커"]),
  S("Docker Compose", ["docker-compose", "도커 컴포즈"], ["Docker"]),
  S("Kubernetes", ["k8s", "쿠버네티스", "쿠베"]),
  S("Helm", [], ["Kubernetes"]),
  S("AWS", ["아마존 웹 서비스"]),
  S("EC2", [], ["AWS"]),
  S("S3", [], ["AWS"]),
  S("RDS", [], ["AWS"]),
  S("AWS Lambda", [], ["AWS"]),
  S("GCP", ["Google Cloud", "구글 클라우드"]),
  S("Azure", ["애저"]),
  S("Terraform", ["테라폼"]),
  S("Jenkins", ["젠킨스"]),
  S("GitHub Actions", ["깃허브 액션"]),
  S("CI/CD", ["CICD"]),
  S("Nginx", ["엔진엑스"]),
  S("Linux", ["리눅스", "Ubuntu", "우분투"]),
  S("Prometheus", ["프로메테우스"]),
  S("Grafana", ["그라파나"]),
  S("Git", ["GitHub", "깃허브", "깃"]),
  // 테스트
  S("JUnit", ["JUnit5"]),
  S("pytest", []),
  // 데이터/ML
  S("Pandas", ["판다스"], ["Python"]),
  S("NumPy", ["넘파이"], ["Python"]),
  S("scikit-learn", ["sklearn", "사이킷런"], ["Python"]),
  S("PyTorch", ["파이토치"], ["Python"]),
  S("TensorFlow", ["텐서플로", "텐서플로우"], ["Python"]),
  S("Keras", ["케라스"]),
  S("Hugging Face", ["HuggingFace", "허깅페이스", "Transformers"]),
  S("KoBERT", [], ["BERT"]),
  S("BERT", []),
  S("LLM", ["대규모 언어 모델", "거대 언어 모델"]),
  S("RAG", ["검색 증강 생성"]),
  S("LangChain", ["랭체인"]),
  S("OpenCV", []),
  S("MLflow", []),
  S("Kubeflow", [], ["Kubernetes"]),
  S("Triton", ["Triton Inference Server"]),
  S("ONNX", []),
  S("Spark", ["Apache Spark", "스파크", "PySpark"]),
  S("Hadoop", ["하둡"]),
  S("Airflow", ["에어플로우"]),
  S("BigQuery", ["빅쿼리"], ["SQL"]),
  S("Snowflake", []),
  S("Tableau", ["태블로"]),
  S("Power BI", ["PowerBI", "파워BI", "파워 BI"]),
  S("Looker", ["Looker Studio", "루커"]),
  S("Excel", ["엑셀"]),
  S("GA4", ["Google Analytics", "구글 애널리틱스", "구글 어낼리틱스"]),
  S("Amplitude", ["앰플리튜드"]),
  S("Jupyter", ["주피터"]),
  S("SPSS", []),
  S("Figma", ["피그마"]),
  S("Jira", ["지라"]),
];

/** 자격증 사전 */
export const CERT_TERMS: TermDef[] = [
  C("정보처리기사", ["정처기"]),
  C("정보처리산업기사", []),
  C("SQLD", []),
  C("SQLP", []),
  C("ADsP", ["데이터분석 준전문가"]),
  C("ADP", ["데이터분석 전문가"]),
  C("빅데이터분석기사", ["빅분기"]),
  C("컴퓨터활용능력", ["컴활"]),
  C("리눅스마스터", []),
  C("정보보안기사", []),
  C("네트워크관리사", []),
  C("TOEIC", ["토익"]),
  C("OPIc", ["오픽"]),
  C("TOEIC Speaking", ["토익스피킹"]),
  C("AWS 자격증", ["AWS SAA", "AWS Certified", "Solutions Architect"]),
  C("CKA", []),
  C("GAIQ", []),
];

/** 경력·수상·논문 등 이력 주장 (원본에 없으면 즉시 환각) */
export const CAREER_TERMS: TermDef[] = [
  K("인턴 경력", ["인턴", "인턴십", "intern", "internship"]),
  K("정규직·재직 경력", ["정규직", "재직", "계약직", "현업"]),
  K("수상 실적", ["수상", "대상", "최우수상", "우수상", "장려상", "금상", "은상", "동상", "입상"]),
  K("특허", ["특허"]),
  K("논문", ["논문", "학회 발표", "저널", "1저자", "제1저자"]),
  K("창업", ["창업", "공동창업"]),
  K("오픈소스 기여", ["오픈소스 기여", "컨트리뷰터", "contributor", "메인테이너"]),
  K("강의·멘토 경력", ["강사", "멘토로", "튜터"]),
];

/** JD 매칭용 역량 개념 사전 (환각 판정에는 쓰지 않음) */
export const CONCEPT_TERMS: TermDef[] = [
  P("협업·커뮤니케이션", ["협업", "커뮤니케이션", "소통", "팀워크", "협력", "코드 리뷰", "Pull Request", "팀원 간"]),
  P("테스트 코드", ["테스트 코드", "단위 테스트", "통합 테스트", "unit test", "TDD", "JUnit", "pytest"]),
  P("코드 리뷰", ["코드 리뷰", "code review", "PR 리뷰"]),
  P("성능 최적화", ["성능 개선", "성능 최적화", "최적화", "응답 시간", "응답 속도", "쿼리 튜닝", "캐싱", "캐시"]),
  P("API 설계·개발", ["API 설계", "API 개발", "REST API", "RESTful", "엔드포인트"]),
  P("DB 설계", ["DB 설계", "데이터베이스 설계", "ERD", "스키마 설계", "데이터 모델링", "인덱스"]),
  P("클라우드 배포", ["클라우드 배포", "AWS", "GCP", "Azure", "EC2", "클라우드"]),
  P("CI/CD", ["CI/CD", "GitHub Actions", "Jenkins", "자동 배포", "파이프라인 자동화"]),
  P("컨테이너", ["Docker", "도커", "컨테이너"]),
  P("모델 서빙", ["서빙", "추론 API", "추론 서버", "FastAPI", "Triton", "모델 배포"]),
  P("MLOps", ["MLOps", "MLflow", "Kubeflow", "모델 모니터링", "실험 관리"]),
  P("딥러닝 모델링", ["딥러닝", "파인튜닝", "fine-tuning", "PyTorch", "TensorFlow"]),
  P("데이터 전처리", ["전처리", "정제", "결측치", "피처 엔지니어링", "데이터 클렌징"]),
  P("데이터 시각화", ["시각화", "대시보드", "Tableau", "Power BI", "Looker"]),
  P("통계 분석", ["통계", "가설 검정", "회귀 분석", "t-test", "카이제곱", "유의성"]),
  P("A/B 테스트", ["A/B 테스트", "A/B테스트", "AB 테스트", "실험 설계"]),
  P("지표 설계", ["지표 설계", "KPI", "핵심 지표", "리텐션", "퍼널", "코호트"]),
  P("문서화", ["문서화", "README", "기술 블로그", "위키", "명세서"]),
  P("영어", ["영어", "TOEIC", "토익", "OPIc", "영문"]),
  P("문제 해결", ["문제 해결", "트러블슈팅", "디버깅", "장애 대응"]),
];

/** 역할 표현 그룹 — 원본에 같은 그룹 표현이 없으면 '과장 의심' */
export const ROLE_PATTERNS: { canonical: string; re: RegExp }[] = [
  { canonical: "총괄", re: /총괄/g },
  { canonical: "리드", re: /리드(?!미)|리딩|이끌|이끈|\blead\b/gi },
  { canonical: "리더·팀장", re: /리더|팀장|프로젝트\s?매니저|\bPM\b|\bPL\b/g },
  { canonical: "주도", re: /주도/g },
  { canonical: "전담·단독", re: /전담|단독|혼자서?|홀로/g },
  { canonical: "책임", re: /책임(?!감)/g },
  { canonical: "전 과정", re: /전\s?과정|전반을|처음부터\s?끝까지|end-to-end/gi },
];

/** 근거 없는 절대 표현 */
export const SUPERLATIVE_PATTERNS: { canonical: string; re: RegExp }[] = [
  { canonical: "최초", re: /최초/g },
  { canonical: "유일", re: /유일/g },
  { canonical: "독보적", re: /독보적/g },
  { canonical: "완벽", re: /완벽(?:하|히|한|하게)/g },
  { canonical: "최고", re: /(?:업계|국내|학과|교내)\s?최고/g },
];

// ---------------- 매칭 유틸 ----------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ASCII_RE = /^[\x20-\x7E]+$/;

function aliasToRegex(alias: string | RegExp): RegExp {
  if (alias instanceof RegExp) {
    const flags = alias.flags.includes("g") ? alias.flags : alias.flags + "g";
    return new RegExp(alias.source, flags);
  }
  if (ASCII_RE.test(alias)) {
    // 영문/기호 용어: 영숫자 경계. 공백은 유연하게.
    const body = escapeRe(alias).replace(/\\? /g, "\\s?");
    return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9+#])`, "gi");
  }
  return new RegExp(escapeRe(alias).replace(/ /g, "\\s?"), "g");
}

interface CompiledTerm {
  def: TermDef;
  regexes: RegExp[];
}

const compileCache = new WeakMap<TermDef[], CompiledTerm[]>();

function compile(list: TermDef[]): CompiledTerm[] {
  let c = compileCache.get(list);
  if (!c) {
    c = list.map((def) => ({ def, regexes: def.aliases.map(aliasToRegex) }));
    compileCache.set(list, c);
  }
  return c;
}

export interface TermHit {
  canonical: string;
  kind: TermKind;
  token: string;
  index: number;
  length: number;
}

/** 텍스트에서 사전 용어를 찾는다. 겹치는 매칭은 더 긴 것을 우선한다. */
export function findTerms(text: string, list: TermDef[]): TermHit[] {
  const raw: TermHit[] = [];
  for (const { def, regexes } of compile(list)) {
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        raw.push({ canonical: def.canonical, kind: def.kind, token: m[0], index: m.index, length: m[0].length });
      }
    }
  }
  // 긴 매칭 우선, 같은 canonical의 중복 위치 제거
  raw.sort((a, b) => b.length - a.length || a.index - b.index);
  const taken: TermHit[] = [];
  for (const h of raw) {
    const overlap = taken.some((t) => h.index < t.index + t.length && t.index < h.index + h.length);
    if (!overlap) taken.push(h);
  }
  return taken.sort((a, b) => a.index - b.index);
}

/** 원본에 등장한 canonical 집합 (상위 용어 포함) */
export function canonicalSet(text: string, list: TermDef[]): Set<string> {
  const set = new Set<string>();
  const byName = new Map(list.map((d) => [d.canonical, d]));
  const add = (name: string) => {
    if (set.has(name)) return;
    set.add(name);
    for (const p of byName.get(name)?.parents ?? []) add(p);
  };
  for (const h of findTerms(text, list)) add(h.canonical);
  return set;
}

export function findPatterns(
  text: string,
  patterns: { canonical: string; re: RegExp }[],
): { canonical: string; token: string; index: number }[] {
  const out: { canonical: string; token: string; index: number }[] = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) out.push({ canonical: p.canonical, token: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
}

export const ALL_FACT_TERMS: TermDef[] = [...STACK_TERMS, ...CERT_TERMS, ...CAREER_TERMS];
