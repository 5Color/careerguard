# CareerGuard — 청년 취업·이력서 팩트체크 MCP & Skill 에이전트

> 2026 대한민국 청년 CAREER FAIR AI 해커톤 · 팀 **팩트체커** (1인 개발)

**"이미 초안을 작성한 취준생의 최종 팩트체크"** 에 최적화된 초저비용 단일 패스(Single-Pass) 하이브리드 검증 에이전트입니다.
자소서 초안의 모든 사실 주장을 **원본 경험(raw_experience)** 에 대조해, 원본에 없는 수치·기술스택·경력(환각)과 역할 부풀리기(과장)를 차단하고,
원본 근거만으로 쓴 안전 수정안과 JD 부족 역량의 2~4주 보완 로드맵을 제시합니다.

- 🌐 **웹 데모**: **https://careerguard-xi.vercel.app** — 로그인 없이 접속 즉시 샘플 1이 자동 실행 (`web-demo/`)
- 🧩 **플러그인** (`plugin/`): Claude Code / Cursor에서 바로 쓰는 표준 stdio MCP 서버(Tool 3종) + Skill

---

## 1. 핵심 아키텍처 — 서브에이전트 없는 2단계 파이프라인

```
 SKILL.md (행동 규범·환각 가드레일)
      │  시스템 프롬프트로 주입
      ▼
 ① extract_jd_matrix ───────── 룰 기반 JD 필수/우대 역량·키워드 구조화            LLM $0
      ▼
 ② verify_resume_evidence
      ├─ 1단계 결정론적 코드 검증 ── 정규식·사전으로 수치/스택/자격/경력/역할 교차 대조  LLM $0
      │      원본에 없는 수치·스택·경력 → LLM 판단 전 즉시 status:"hallucination"
      └─ 2단계 단일 패스 LLM ──────── Gemini 1회 호출 (JSON Schema 강제)
             의미적 과장 탐지 + 원본 기반 수정안 + JD 평가 + 2~4주 로드맵을 한 번에
             ⤷ 모델 폴백 체인: GEMINI_MODEL → GEMINI_FALLBACK_MODEL → 오프라인 결정론적 모드
      ▼
 ③ build_gap_roadmap ───────── JD 충족도(원본 기준) + 로드맵 (LLM 결과 보수적 병합)   LLM $0
```

### 환각 차단 원칙 (코드로 강제)
| 원칙 | 구현 |
|---|---|
| 원본이 유일한 근거 | JD 매칭·문장 판정 모두 `raw_experience` 기준. 초안 내용은 근거로 인정하지 않음 |
| 코드 판정 우선 | 1단계가 `hallucination`으로 판정한 문장은 LLM이 완화할 수 없음 (더 엄격하게만 병합) |
| LLM 인용 검증 | LLM이 제시한 근거 문장이 원본에 실제로 없으면 폐기 |
| 수정안 재검증 | LLM 수정안에 원본에 없는 수치·스택·경력이 섞이면 코드가 `[확인 필요: …]`로 치환 |
| 계산 근거 인정 | `1.2초 → 0.84초` 원본이면 초안의 `30% 단축`은 계산 가능 수치로 인정, `60%`는 환각 |
| JD 하드 키워드 | 스택·자격 키워드가 원본에 없으면 LLM이 `충족`으로 올릴 수 없음 |

### 다중 모델 폴백 체인
| 순위 | 설정 | 실패 시 |
|---|---|---|
| 1 | `GEMINI_MODEL` (예: `gemini-4-hydrogen`, `gemini-4-neon`) | 2순위로 1회 재시도 |
| 2 | `GEMINI_FALLBACK_MODEL` (기본값 `gemini-3.8-flash`) | 오프라인 모드 |
| 3 | 1단계 결정론적 코드 검증 + 룰 기반 JD 매칭 + 템플릿 로드맵 | — (항상 동작) |

- 키 인증 실패는 모든 모델에 공통이므로 즉시 3순위로 내려갑니다.
- 모델이 thinking 설정을 거부(400)하면 같은 모델에 기본 설정으로 1회만 재시도합니다.
- 결과 요약 카드와 MCP 실행 로그에는 **API가 실제로 응답한 모델명**(`response.modelVersion`)을 표시합니다. 요청 모델과 응답 모델이 다르면 둘 다 표시합니다.

> **확인된 사실 (2026-11-23, 이 프로젝트의 API 키 기준)**
> - `models.list`에 `gemini-4-hydrogen`, `gemini-4-neon` 이 generateContent 지원 모델로 노출됨
> - `gemini-2.5-flash` 는 목록에는 있으나 호출 시 **404 "no longer available to new users"** → 2순위 기본값을 `gemini-3.8-flash` 로 지정
> - `gemini-3.5-flash` 요청 시 실제 응답 모델은 `gemini-3.6-flash` 였음 (응답 모델 표시가 필요한 이유)
> - 사고 수준 `MINIMAL` 은 위 모델들에서 거부됨 → 기본값 `LOW`

---

## 2. 디렉토리 구조

```
careerguard/
├── README.md
├── package.json                       # npm workspaces (plugin/mcp-server, web-demo)
├── .claude-plugin/marketplace.json    # Claude Code 플러그인 마켓플레이스
├── plugin/                            # Claude Code / Cursor 표준 MCP + Skill 플러그인
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json                      # stdio MCP 서버 연결 설정
│   ├── skills/resume-factcheck/SKILL.md
│   └── mcp-server/
│       ├── package.json · tsconfig.json
│       ├── bundle/careerguard-mcp.mjs # 의존성 포함 단일 파일 배포본 (npm install 불필요)
│       ├── scripts/bundle.mjs · smoke.mjs
│       └── src/
│           ├── index.ts               # @modelcontextprotocol/sdk stdio 서버 (Tool 3종)
│           ├── types.ts
│           └── core/
│               ├── extractJdMatrix.ts # Tool 1
│               ├── verifyEvidence.ts  # Tool 2 (1차 코드 + 2차 LLM + 폴백)
│               ├── buildGapRoadmap.ts # Tool 3
│               ├── gemini.ts          # 모델 폴백 체인 · 비용 추정
│               ├── lexicon.ts         # 기술스택·자격·경력·역할 사전
│               ├── text.ts            # 문장 분리 · 수치 추출 · 계산 근거
│               └── index.ts           # web-demo가 import 하는 코어 진입점
└── web-demo/                          # 심사위원 시연용 Next.js App Router (Vercel)
    ├── .env.example
    ├── scripts/sync-plugin-files.mjs  # plugin 원문(SKILL.md·.mcp.json)을 번들에 포함
    ├── scripts/smoke.mjs              # 샘플 3종 × 오프라인/하이브리드 HTTP 테스트
    └── src/
        ├── lib/samples.ts · pipeline.ts · contracts.ts
        ├── components/results.tsx · plugin-modal.tsx · ui.tsx
        └── app/layout.tsx · page.tsx · api/analyze/route.ts
```

web-demo는 `@careerguard/mcp-server/core` 를 통해 **플러그인과 동일한 코어 코드**를 직접 import 합니다 (복붙 없음).

---

## 3. 빠른 시작

```bash
npm install                 # 루트에서 1회 (workspaces)
npm run build:plugin        # tsc 빌드 + 단일 파일 번들
cp web-demo/.env.example web-demo/.env.local   # GEMINI_API_KEY 입력 (없으면 오프라인 모드)
npm run dev                 # http://localhost:3000
```

| 환경변수 (서버 전용) | 기본값 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | — | 없으면 오프라인 결정론적 모드로 동작 |
| `GEMINI_MODEL` | — | 1순위 모델 ID (예: `gemini-4-hydrogen`) |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` | 2순위 안정화 Flash 모델 |
| `GEMINI_THINKING_LEVEL` | `LOW` | 3.x/4.x 모델 사고 수준 (`DEFAULT`=모델 기본값) |
| `GEMINI_TIMEOUT_MS` | `25000` | 모델 1회 시도당 타임아웃 |

### Vercel 배포 (현재: https://careerguard-xi.vercel.app , `main` push 시 자동 배포)
1. 저장소 import → **Root Directory = `web-demo`**, Node.js 24.x, Framework = Next.js
2. `web-demo/vercel.json` 이 install을 모노레포 루트에서 수행 (`cd .. && npm ci`) → `../plugin` 코어가 workspace 링크로 설치됨
   - `web-demo/package.json` 의 `"@careerguard/mcp-server": "file:../plugin/mcp-server"` 로 npm 레지스트리 조회를 원천 차단 (동명 패키지 혼입 방지)
   - `next.config.ts` 의 `transpilePackages` + `turbopack.root` / `outputFileTracingRoot` = 모노레포 루트 → 상위 경로 TS 소스 컴파일 및 서버리스 함수 파일 추적
   - `prebuild` 가 `plugin/` 의 SKILL.md·.mcp.json 원문을 번들에 포함 (런타임 파일시스템 접근 없음)
3. Environment Variables (Production·Preview, Sensitive): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_THINKING_LEVEL` — `NEXT_PUBLIC_` 접두사 금지
4. `/api/analyze` 는 Node.js 런타임, `maxDuration = 60s` (1순위 25s + 2순위 25s 여유)

---

## 4. 플러그인 설치

**Claude Code**
```
/plugin marketplace add https://github.com/5Color/careerguard
/plugin install careerguard@careerguard
```
`plugin/.mcp.json` 이 `${CLAUDE_PLUGIN_ROOT}/mcp-server/bundle/careerguard-mcp.mjs` 를 stdio로 실행하고, `GEMINI_API_KEY` 등은 셸 환경변수에서 전달됩니다 (미설정 시 오프라인 모드).

**Cursor** (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "careerguard": {
      "command": "node",
      "args": ["<repo>/plugin/mcp-server/bundle/careerguard-mcp.mjs"],
      "env": { "GEMINI_API_KEY": "<선택>", "GEMINI_MODEL": "gemini-4-hydrogen", "GEMINI_FALLBACK_MODEL": "gemini-3.8-flash" }
    }
  }
}
```

### MCP Tools
| Tool | 입력 | 출력 |
|---|---|---|
| `extract_jd_matrix` | `jd_text` | 필수/우대 요구사항, 정규화 키워드, AND/OR 로직 |
| `verify_resume_evidence` | `raw_experience`, `draft_text`, `jd_text?`, `use_llm?` | 문장별 판정·사유(코드/LLM)·원본 근거·수정안, 신뢰도, 사용 모델·토큰·지연, `llmHints` |
| `build_gap_roadmap` | `jd_text`, `raw_experience`, `llm_hints?` | 요구사항별 충족/부분/미충족, 매칭률, 2~4주 로드맵 |

---

## 5. 검증 결과 (로컬, 2026-11-23)

| 항목 | 결과 |
|---|---|
| `plugin/mcp-server` `tsc` 빌드 + 번들 | ✅ (`dist/index.js` · `bundle/careerguard-mcp.mjs` 모두 기동 확인) |
| stdio MCP 스모크 (`npm run smoke:plugin`) | ✅ Tool 3종 호출, 판정 `과장·일치·환각·환각` 기대값 일치 |
| `web-demo` `next build` | ✅ |
| HTTP 스모크 — 오프라인 모드 × 샘플 3종 | ✅ 24~690ms |
| HTTP 스모크 — 하이브리드(`gemini-4-hydrogen`) × 샘플 3종 | ✅ 7.5~14.8s, 응답 모델 표시 |
| 새 clone에서 Vercel 방식 빌드 (`cd .. && npm ci` → `web-demo` 빌드) | ✅ |
| **Vercel 프로덕션** 스모크 (오프라인 3 + Hydrogen 3 + 입력 검증) | ✅ 하이브리드 6.9~11.1s, 공개 HTML/JS에 키 없음 |
| 입력 상한 5,000자 경계 · IP당 분당 10회 | ✅ 5,000자 200 / 5,001자 400 · 11번째 요청 429 |
| 폴백: 존재하지 않는 1순위 → `gemini-3.8-flash` 응답 | ✅ |
| 폴백: 타임아웃 / 잘못된 키 → 오프라인 모드 | ✅ 앱 정상 응답 + 배지 표시 |

| 샘플 | 시나리오 | 판정 (오프라인/하이브리드 동일) | JD 매칭 |
|---|---|---|---|
| 1 백엔드 신입 | 30% → 60% 수치 과장, 팀원 → 총괄 리드 | 환각 1 (60%) · 과장 1 (총괄 리드) | 83% |
| 2 AI 엔지니어 | 원본에 없는 인턴 6개월, 쿠버네티스 | 환각 2 (인턴·쿠버네티스) | 77% |
| 3 데이터 분석가 | 사실 일치, A/B·통계·GA4·BigQuery 누락 | 전 문장 일치 (신뢰도 100) | 50% |

---

## 6. 보안 · 컴플라이언스
- API 키는 **서버 사이드 환경변수로만** 읽습니다. 클라이언트 코드에 `process.env`/`NEXT_PUBLIC_` 사용 없음, 응답·로그 문자열에서 키 패턴 마스킹.
- 저장소·빌드 산출물(`.next`, 번들)에 키 문자열이 없음을 grep으로 확인. `.env*` 는 `.gitignore` 처리 (`.env.example` 만 커밋).
- 공개 데모 보호: 항목(JD·원본 경험·초안)당 **5,000자** 상한, **IP당 분당 10회** 호출 제한(서버리스 인스턴스 단위 best-effort, 초과 시 HTTP 429), 입력값 비저장.
- 화면 상단 고지: "AI가 생성·검증한 결과입니다 (인공지능기본법 제31조 준수 안내)", "실제 개인정보 입력 금지 · 가상 샘플 데이터 사용". 모든 샘플은 가상 인물·가상 기업입니다.

---

## 7. Credits / Licenses

| 구성요소 | 버전 | 용도 | 라이선스 |
|---|---|---|---|
| [Next.js](https://github.com/vercel/next.js) | 16.4.6 | 웹 데모 프레임워크 (App Router) | MIT |
| [React](https://github.com/facebook/react) / React DOM | 19.3.1 | UI | MIT |
| [@google/genai](https://github.com/googleapis/js-genai) | 3.6.1 | Gemini API SDK (2단계 LLM 검증) | Apache-2.0 |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.32.2 | stdio MCP 서버 | MIT |
| [Zod](https://github.com/colinhacks/zod) | 4.6.7 | MCP Tool 입력 스키마 | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) / @tailwindcss/postcss | 4.3.5 | 스타일링 | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 5.9.3 | 언어 · 빌드 | Apache-2.0 |
| [esbuild](https://github.com/evanw/esbuild) | 0.28.2 | 플러그인 단일 파일 번들 | MIT |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | 개발용 TS 실행 | MIT |
| [server-only](https://www.npmjs.com/package/server-only) | 0.0.1 | 서버 전용 모듈 가드 | MIT |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped), @types/react | 24.x / 19.x | 타입 정의 | MIT |
| [Pretendard](https://github.com/orioncactus/pretendard) (jsDelivr CDN) | 1.3.9 | 웹 폰트 | SIL OFL 1.1 |
| Google Gemini API | `gemini-4-hydrogen` 등 | 2단계 의미 검증 (외부 API) | Google APIs 이용약관 |

번들 배포본에 포함된 서드파티 라이선스 고지는 `plugin/mcp-server/bundle/careerguard-mcp.mjs.LEGAL.txt` 에 함께 생성됩니다.
프로젝트 자체 라이선스: MIT (`package.json` 기준).
