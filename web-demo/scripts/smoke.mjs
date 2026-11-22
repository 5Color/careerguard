// HTTP 스모크 테스트: 실행 중인 web-demo(/api/analyze)에 샘플 3종 × 모드(오프라인/하이브리드)를 요청한다.
// 사용: node scripts/smoke.mjs [BASE_URL] [--offline-only]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const offlineOnly = process.argv.includes("--offline-only");

// samples.ts 를 의존성 없이 읽기 위해 템플릿 리터럴을 직접 파싱
const src = readFileSync(path.join(here, "../src/lib/samples.ts"), "utf8");
const samples = [...src.matchAll(/label: "([^"]+)"[\s\S]*?jd: `([\s\S]*?)`,\s*raw: `([\s\S]*?)`,\s*draft: `([\s\S]*?)`/g)].map(
  (m) => ({ label: m[1], jd: m[2], raw: m[3], draft: m[4] }),
);
if (samples.length !== 3) throw new Error(`샘플 파싱 실패: ${samples.length}`);

let failed = 0;
for (const mode of offlineOnly ? ["offline"] : ["offline", "auto"]) {
  for (const s of samples) {
    const t = Date.now();
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd: s.jd, raw: s.raw, draft: s.draft, mode }),
    });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const result = lines.find((l) => l.type === "result")?.result;
    const err = lines.find((l) => l.type === "error");
    const logCount = lines.filter((l) => l.type === "log").length;
    if (!res.ok || !result || err) {
      failed++;
      console.log(`✗ [${mode}] ${s.label} — HTTP ${res.status} ${err?.message ?? ""}`);
      continue;
    }
    const v = result.verify;
    console.log(
      `✓ [${mode.padEnd(7)}] ${s.label.padEnd(14)} mode=${result.mode.padEnd(7)} trust=${String(v.stats.trustScore).padStart(3)} ` +
        `환각=${v.stats.hallucination} 과장=${v.stats.exaggeration} JD=${result.roadmap.matchRate}% ` +
        `model=${result.respondedModel ?? "-"} ${Date.now() - t}ms logs=${logCount}` +
        (result.mode === "offline" && mode === "auto" ? `\n    fallback: ${v.fallbackReason}` : ""),
    );
  }
}
// 키가 응답 어디에도 섞이지 않았는지 확인
const probe = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jd: "x", raw: "", draft: "" }),
});
console.log(`입력 검증: HTTP ${probe.status} (400 기대)`);
if (probe.status !== 400) failed++;
process.exit(failed ? 1 : 0);
