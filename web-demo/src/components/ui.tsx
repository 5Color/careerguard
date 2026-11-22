"use client";
import type { Coverage, Verdict } from "@careerguard/mcp-server/core";

export const VERDICT_META: Record<
  Verdict | "applied" | "deleted",
  { label: string; short: string; bg: string; text: string; ring: string; dot: string }
> = {
  verified: { label: "근거 일치", short: "일치", bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-300", dot: "bg-emerald-500" },
  exaggeration: { label: "과장 의심", short: "과장", bg: "bg-amber-100", text: "text-amber-900", ring: "ring-amber-300", dot: "bg-amber-500" },
  hallucination: { label: "근거 없음 · 환각 차단", short: "환각", bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-300", dot: "bg-rose-500" },
  applied: { label: "수정안 적용됨", short: "수정", bg: "bg-sky-100", text: "text-sky-900", ring: "ring-sky-300", dot: "bg-sky-500" },
  deleted: { label: "삭제됨", short: "삭제", bg: "bg-slate-100", text: "text-slate-400 line-through", ring: "ring-slate-200", dot: "bg-slate-400" },
};

export const COVERAGE_META: Record<Coverage, { label: string; cls: string }> = {
  met: { label: "충족", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  partial: { label: "부분 충족", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  unmet: { label: "미충족", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
};

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function SourceTag({ source }: { source: "code" | "llm" | "rule" }) {
  const map = {
    code: "bg-navy-100 text-navy-800 ring-navy-200",
    rule: "bg-navy-100 text-navy-800 ring-navy-200",
    llm: "bg-violet-100 text-violet-800 ring-violet-200",
  } as const;
  const label = source === "llm" ? "LLM 근거" : source === "rule" ? "규칙 기반" : "코드 근거";
  return <Badge className={map[source]}>{label}</Badge>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
}
