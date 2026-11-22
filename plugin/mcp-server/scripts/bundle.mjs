// 의존성(node_modules)까지 포함한 단일 파일 배포본을 만든다.
// 플러그인 설치 시 별도 npm install 없이 `node bundle/careerguard-mcp.mjs` 로 바로 실행되도록 하기 위함.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  outfile: path.join(root, "bundle/careerguard-mcp.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  legalComments: "linked",
  logLevel: "info",
  // ESM 번들 안에서 CJS 의존성이 require()를 쓸 수 있게 한다.
  banner: {
    js: "import { createRequire as __cgCreateRequire } from 'node:module'; const require = __cgCreateRequire(import.meta.url);",
  },
});
