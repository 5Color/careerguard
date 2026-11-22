#!/usr/bin/env node
// CareerGuard stdio MCP 서버 — Tool 3종 등록
//   extract_jd_matrix       : JD 필수/우대 역량 구조화 (룰 기반, 0원)
//   verify_resume_evidence  : 1차 결정론적 코드 검증 + 2차 단일 패스 LLM 의미 검증 (폴백 내장)
//   build_gap_roadmap       : JD 충족도 + 2~4주 단기 보완 로드맵
// 주의: stdio 전송에서는 stdout이 프로토콜 채널이므로 로그는 반드시 stderr(console.error)로만 남긴다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { extractJdMatrix } from "./core/extractJdMatrix.ts";
import { DEFAULT_GUARDRAILS, verifyEvidence } from "./core/verifyEvidence.ts";
import { buildGapRoadmap } from "./core/buildGapRoadmap.ts";

const VERSION = "0.1.0";
const MAX_CHARS = 20_000;

/** plugin/skills/resume-factcheck/SKILL.md 를 LLM 시스템 프롬프트로 로드 (dist/·bundle/ 어느 쪽에서 실행돼도 같은 상대경로) */
function loadSkill(): { text: string; path: string | null } {
  const candidates = [
    process.env.CAREERGUARD_SKILL_PATH,
    fileURLToPath(new URL("../../skills/resume-factcheck/SKILL.md", import.meta.url)),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      return { text: readFileSync(p, "utf8"), path: p };
    } catch {
      /* 다음 후보 */
    }
  }
  return { text: DEFAULT_GUARDRAILS, path: null };
}

const skill = loadSkill();

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const server = new McpServer(
  { name: "careerguard", version: VERSION },
  {
    instructions:
      "자소서 팩트체크 도구. 순서: extract_jd_matrix → verify_resume_evidence → build_gap_roadmap. 각 도구는 한 번씩만 호출하고, 근거 없는 정보는 [확인 필요]로 표기하라.",
  },
);

server.registerTool(
  "extract_jd_matrix",
  {
    title: "JD 역량 매트릭스 추출",
    description:
      "채용공고(JD) 원문을 필수/우대 요구사항과 정규화된 기술·역량 키워드로 구조화한다. 룰 기반이라 LLM 비용이 들지 않는다.",
    inputSchema: {
      jd_text: z.string().min(1).max(MAX_CHARS).describe("채용공고 원문"),
    },
  },
  async ({ jd_text }) => json(extractJdMatrix(jd_text)),
);

server.registerTool(
  "verify_resume_evidence",
  {
    title: "자소서 근거 검증 (하이브리드 단일 패스)",
    description:
      "자소서 초안(draft_text)의 문장별 사실 주장을 원본 경험(raw_experience)과 대조한다. 1차: 정규식·룰로 수치·기술스택·자격·경력 키워드를 교차 대조해 원본에 없으면 즉시 hallucination 판정(비용 0원). 2차: GEMINI_API_KEY가 있으면 Gemini를 단 1회 JSON Schema 모드로 호출해 의미적 과장(exaggeration)과 안전 수정안을 받는다. 키가 없거나 오류 시 1차 결과만 반환(offline 모드).",
    inputSchema: {
      raw_experience: z.string().min(1).max(MAX_CHARS).describe("원본 경험 기록 (유일한 근거)"),
      draft_text: z.string().min(1).max(MAX_CHARS).describe("검증할 자기소개서/이력서 초안"),
      jd_text: z
        .string()
        .max(MAX_CHARS)
        .optional()
        .describe("채용공고 원문 (선택). 주면 같은 LLM 호출에서 JD 평가·로드맵 힌트도 받는다"),
      use_llm: z.boolean().optional().describe("false면 LLM 없이 결정론적 검증만 수행 (기본 true)"),
    },
  },
  async ({ raw_experience, draft_text, jd_text, use_llm }) => {
    const jdMatrix = jd_text ? extractJdMatrix(jd_text) : undefined;
    const result = await verifyEvidence({
      rawExperience: raw_experience,
      draftText: draft_text,
      jdMatrix,
      useLlm: use_llm,
      systemPrompt: skill.text,
    });
    return json(result);
  },
);

const coverageEnum = z.enum(["met", "partial", "unmet"]);

server.registerTool(
  "build_gap_roadmap",
  {
    title: "JD 갭 분석 & 2~4주 보완 로드맵",
    description:
      "원본 경험 기준으로 JD 요구사항 충족도(충족/부분 충족/미충족)와 매칭률을 계산하고, 부족 역량을 허위 없이 2~4주 안에 채우는 구체적 액션 플랜을 만든다. verify_resume_evidence 결과의 llmHints를 넘기면 보수적으로 병합한다.",
    inputSchema: {
      jd_text: z.string().min(1).max(MAX_CHARS).describe("채용공고 원문"),
      raw_experience: z.string().min(1).max(MAX_CHARS).describe("원본 경험 기록"),
      llm_hints: z
        .object({
          jd: z.array(z.object({ id: z.string(), status: coverageEnum, evidence: z.string() })).optional(),
          roadmap: z
            .array(
              z.object({
                week: z.number().int(),
                title: z.string(),
                focus: z.array(z.string()).default([]),
                actions: z.array(z.string()),
                deliverable: z.string(),
              }),
            )
            .optional(),
        })
        .optional()
        .describe("verify_resume_evidence 결과의 llmHints (선택)"),
    },
  },
  async ({ jd_text, raw_experience, llm_hints }) =>
    json(buildGapRoadmap({ matrix: extractJdMatrix(jd_text), rawExperience: raw_experience, hints: llm_hints })),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[careerguard] MCP server v${VERSION} ready (stdio) · SKILL.md ${skill.path ? "loaded" : "fallback guardrails"} · LLM ${process.env.GEMINI_API_KEY ? "enabled" : "offline mode"}`,
  );
}

main().catch((err) => {
  console.error("[careerguard] fatal:", err);
  process.exit(1);
});
