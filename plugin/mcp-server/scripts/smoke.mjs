// stdio MCP 서버 스모크 테스트: 번들을 실제 MCP 클라이언트로 띄워 Tool 3종을 호출한다.
// 사용: node scripts/smoke.mjs [--llm]   (기본은 오프라인 결정론적 모드)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const useLlm = process.argv.includes("--llm");

const JD = `[가상기업] 백엔드 개발자 (신입)
자격 요건
- Java 또는 Kotlin 기반 Spring Boot 개발 경험
- REST API 설계 및 개발 경험
우대 사항
- Docker 기반 배포 경험`;
const RAW = `- 4인 팀에서 백엔드 팀원으로 참여
- Java, Spring Boot로 REST API 12개 개발
- 응답 시간을 1.2초에서 0.84초로 약 30% 단축 (Redis 캐시)`;
const DRAFT = `팀의 백엔드를 총괄 리드했습니다. Spring Boot로 REST API 12개를 개발했습니다. Redis로 응답 시간을 60% 단축했습니다. 쿠버네티스로 배포했습니다.`;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "bundle/careerguard-mcp.mjs")],
  env: { ...process.env, ...(useLlm ? {} : { GEMINI_API_KEY: "" }) },
  stderr: "inherit",
});
const client = new Client({ name: "careerguard-smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const parse = (r) => JSON.parse(r.content[0].text);
const jd = parse(await client.callTool({ name: "extract_jd_matrix", arguments: { jd_text: JD } }));
console.log(`extract_jd_matrix: 필수 ${jd.required.length} / 우대 ${jd.preferred.length} / keywords=${jd.keywords.join(",")}`);

const v = parse(
  await client.callTool({
    name: "verify_resume_evidence",
    arguments: { raw_experience: RAW, draft_text: DRAFT, jd_text: JD, use_llm: useLlm },
  }),
);
console.log(`verify_resume_evidence: mode=${v.mode} trust=${v.stats.trustScore} blocked=${v.stats.blocked}${v.llm ? ` model=${v.llm.respondedModel}` : ""}`);
for (const s of v.sentences) console.log(`  [${s.status}] ${s.text}`);

const g = parse(
  await client.callTool({
    name: "build_gap_roadmap",
    arguments: { jd_text: JD, raw_experience: RAW, ...(v.llmHints ? { llm_hints: v.llmHints } : {}) },
  }),
);
console.log(`build_gap_roadmap: match=${g.matchRate}% weeks=${g.durationWeeks} source=${g.source}`);

const statuses = v.sentences.map((s) => s.status).join(",");
const expected = "exaggeration,verified,hallucination,hallucination";
await client.close();
if (!useLlm && statuses !== expected) {
  console.error(`FAIL: expected ${expected}, got ${statuses}`);
  process.exit(1);
}
console.log("SMOKE OK");
