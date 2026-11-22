// plugin/ 원문(.mcp.json, SKILL.md, plugin.json)을 web-demo 번들에 문자열로 포함시킨다.
// → 서버리스(Vercel)에서도 파일시스템 접근 없이 SKILL.md를 시스템 프롬프트로 쓰고, 모달에서 원문을 그대로 보여준다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "../../plugin");
const outDir = path.resolve(here, "../src/generated");

const read = (rel) => readFileSync(path.join(pluginDir, rel), "utf8").replace(/\r\n/g, "\n");

const files = {
  MCP_JSON: { path: "plugin/.mcp.json", content: read(".mcp.json") },
  SKILL_MD: { path: "plugin/skills/resume-factcheck/SKILL.md", content: read("skills/resume-factcheck/SKILL.md") },
  PLUGIN_JSON: { path: "plugin/.claude-plugin/plugin.json", content: read(".claude-plugin/plugin.json") },
};

let out = "// 자동 생성 파일 — scripts/sync-plugin-files.mjs 가 plugin/ 원문에서 생성합니다. 직접 수정하지 마세요.\n\n";
for (const [name, f] of Object.entries(files)) {
  out += `export const ${name} = ${JSON.stringify(f.content)};\n`;
  out += `export const ${name}_PATH = ${JSON.stringify(f.path)};\n\n`;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "plugin-files.ts"), out, "utf8");
console.log(`[sync-plugin-files] ${Object.keys(files).length} files → src/generated/plugin-files.ts`);
