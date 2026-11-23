import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerGuard · 자소서 팩트체크",
  description:
    "이미 작성한 자소서 초안의 수치·기술스택·경력 환각과 역할 과장을 원본 경험에 대조해 차단하는 MCP & Skill 에이전트 데모 (팀 팩트체커)",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c1d38",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
