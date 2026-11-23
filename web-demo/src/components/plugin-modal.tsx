"use client";
import { useEffect, useState } from "react";
import {
  MCP_JSON,
  MCP_JSON_PATH,
  PLUGIN_JSON,
  PLUGIN_JSON_PATH,
  SKILL_MD,
  SKILL_MD_PATH,
} from "@/generated/plugin-files";

const FILES = [
  { key: "mcp", label: ".mcp.json", path: MCP_JSON_PATH, content: MCP_JSON },
  { key: "skill", label: "SKILL.md", path: SKILL_MD_PATH, content: SKILL_MD },
  { key: "plugin", label: "plugin.json", path: PLUGIN_JSON_PATH, content: PLUGIN_JSON },
] as const;

const INSTALL = `# Claude Code
/plugin marketplace add https://github.com/5Color/careerguard
/plugin install careerguard@careerguard

# Cursor (.cursor/mcp.json)
{ "mcpServers": { "careerguard": {
  "command": "node",
  "args": ["<repo>/plugin/mcp-server/bundle/careerguard-mcp.mjs"],
  "env": { "GEMINI_API_KEY": "<선택>", "GEMINI_MODEL": "gemini-4-hydrogen" } } } }`;

export function PluginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof FILES)[number]["key"] | "install">("mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const file = FILES.find((f) => f.key === tab);
  const content = file ? file.content : INSTALL;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 권한 없음 */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="플러그인 패키지"
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-navy-900">플러그인 패키지 (Claude Code · Cursor 표준 MCP + Skill)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              웹 데모와 동일한 코어 로직(plugin/mcp-server/src/core)을 stdio MCP 서버로 제공합니다. 아래는 저장소의 실제 원문입니다.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-5 pt-3">
          {[...FILES.map((f) => ({ key: f.key, label: f.label })), { key: "install" as const, label: "설치 방법" }].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-md px-3 py-2 font-mono text-xs font-semibold ${tab === t.key ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">{file?.path ?? "README.md"}</span>
            <button onClick={copy} className="rounded-md bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700">
              {copied ? "복사됨 ✓" : "복사"}
            </button>
          </div>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-navy-950 px-5 py-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-navy-50">
          {content}
        </pre>
      </div>
    </div>
  );
}
