import type { NextConfig } from "next";
import path from "node:path";

// 모노레포 루트 (plugin/ 의 코어 로직을 web-demo에서 직접 import)
const monorepoRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  transpilePackages: ["@careerguard/mcp-server"],
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
