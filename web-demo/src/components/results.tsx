"use client";
import { useEffect, useRef } from "react";
import type { SentenceResult } from "@careerguard/mcp-server/core";
import type { AnalyzeResult, LogStep } from "@/lib/contracts";
import { Badge, Card, COVERAGE_META, SourceTag, VERDICT_META } from "./ui";

// ---------------- 요약 카드 ----------------

export function SummaryCards({ result }: { result: AnalyzeResult }) {
  const { stats } = result.verify;
  const llm = result.verify.llm;
  const scoreColor = stats.trustScore >= 80 ? "text-emerald-600" : stats.trustScore >= 50 ? "text-amber-600" : "text-rose-600";
  const matchColor = result.roadmap.matchRate >= 75 ? "text-emerald-600" : result.roadmap.matchRate >= 50 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">팩트 신뢰도</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${scoreColor}`}>
            {stats.trustScore}
            <span className="text-base font-semibold text-slate-400">/100</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.totalSentences}문장 중 근거 일치 {stats.verified}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">차단된 환각 · 과장</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-navy-900">
            {stats.blocked}
            <span className="text-base font-semibold text-slate-400">건</span>
          </p>
          <p className="mt-1 flex gap-2 text-[11px]">
            <span className="text-rose-600">환각 {stats.hallucination}</span>
            <span className="text-amber-600">과장 {stats.exaggeration}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">JD 매칭률</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${matchColor}`}>
            {result.roadmap.matchRate}
            <span className="text-base font-semibold text-slate-400">%</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">필수 2배 가중 · 원본 경험 기준</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">실행 시간</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-navy-900">
            {result.totalMs.toLocaleString()}
            <span className="text-base font-semibold text-slate-400">ms</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            코드 {result.verify.timings.stage1Ms}ms{llm ? ` · LLM ${llm.latencyMs.toLocaleString()}ms` : ""}
          </p>
        </Card>
      </div>
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs">
        <span className="font-semibold text-navy-800">⚡ {result.efficiency}</span>
        <span className="hidden h-4 w-px bg-slate-200 sm:block" />
        {result.mode === "hybrid" && llm ? (
          <span className="flex flex-wrap items-center gap-2 text-slate-600">
            응답 모델
            <Badge className="bg-violet-50 font-mono text-violet-800 ring-violet-200">{llm.respondedModel}</Badge>
            {llm.fallbackUsed && (
              <Badge className="bg-amber-50 text-amber-900 ring-amber-200">1순위 {llm.chain[0]} 실패 → 2순위 폴백</Badge>
            )}
            {llm.respondedModel !== llm.model && (
              <span className="text-slate-400">(요청: {llm.model})</span>
            )}
            <span className="text-slate-400">
              · 토큰 {llm.inputTokens.toLocaleString()}/{llm.outputTokens.toLocaleString()}
              {llm.estCostUsd !== null ? ` · ≈$${llm.estCostUsd.toFixed(5)}` : " · 단가 미공개 모델"}
            </span>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-slate-600">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-300">오프라인 결정론적 검증 모드로 동작함</Badge>
            <span className="text-slate-500">{result.verify.fallbackReason}</span>
          </span>
        )}
      </Card>
      {result.verify.llmSummary && (
        <p className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-2.5 text-[13px] leading-relaxed text-violet-950">
          <span className="mr-1.5 font-semibold">LLM 총평</span>
          {result.verify.llmSummary}
        </p>
      )}
    </div>
  );
}

// ---------------- MCP 파이프라인 로그 ----------------

const LOG_STATUS: Record<LogStep["status"], { label: string; cls: string }> = {
  running: { label: "실행 중", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  done: { label: "완료", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  fallback: { label: "폴백", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  skipped: { label: "건너뜀", cls: "bg-slate-50 text-slate-600 ring-slate-200" },
  error: { label: "오류", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
};

export function PipelineLog({ logs, running }: { logs: LogStep[]; running: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-navy-950 px-4 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide text-navy-100">MCP Tool 파이프라인 실행 로그</h3>
        <span className="font-mono text-[11px] text-navy-300">
          {running ? (
            <span className="flex items-center gap-1.5">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400" /> streaming
            </span>
          ) : (
            "single-pass · no sub-agents"
          )}
        </span>
      </div>
      <ol className="divide-y divide-slate-100">
        {logs.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-400">실행 대기 중</li>}
        {logs.map((l, i) => (
          <li key={l.id} className="grid grid-cols-[auto_1fr] gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy-100 font-mono text-[10px] font-bold text-navy-700">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-navy-800">{l.tool}</code>
                <span className="text-[13px] font-medium text-navy-900">{l.title}</span>
                <Badge className={LOG_STATUS[l.status].cls}>
                  {l.status === "running" && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />}
                  {LOG_STATUS[l.status].label}
                </Badge>
                {l.model && <Badge className="bg-violet-50 font-mono text-violet-800 ring-violet-200">{l.model}</Badge>}
                <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-500">
                  {l.status === "running" ? "…" : `${l.durationMs.toLocaleString()}ms`} · {l.cost}
                </span>
              </div>
              <p className="mt-1 break-words text-[11.5px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-400">IN</span> {l.input}
              </p>
              {l.output && (
                <p className="break-words text-[11.5px] leading-relaxed text-slate-700">
                  <span className="font-semibold text-slate-400">OUT</span> {l.output}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------- 탭 1: 팩트체크 리포트 ----------------

type Applied = Record<string, string>;

function displayState(s: SentenceResult, applied: Applied): keyof typeof VERDICT_META {
  if (s.id in applied) return applied[s.id] === "" ? "deleted" : "applied";
  return s.status;
}

export function FactCheckTab({
  result,
  analyzedDraft,
  applied,
  draftEdited,
  onApply,
  onApplyAll,
  activeId,
  setActiveId,
}: {
  result: AnalyzeResult;
  analyzedDraft: string;
  applied: Applied;
  draftEdited: boolean;
  onApply: (id: string, text: string) => void;
  onApplyAll: () => void;
  activeId: string | null;
  setActiveId: (id: string) => void;
}) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sentences = result.verify.sentences;
  const flagged = sentences.filter((s) => s.status !== "verified");
  const pending = flagged.filter((s) => s.suggestion !== undefined && !(s.id in applied));

  useEffect(() => {
    if (activeId) cardRefs.current[activeId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeId]);

  // 원문을 문장 오프셋 기준으로 재구성 (문장 사이 공백·줄바꿈 보존)
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const s of sentences) {
    if (s.start > cursor) parts.push(<span key={`g${s.id}`}>{analyzedDraft.slice(cursor, s.start)}</span>);
    const state = displayState(s, applied);
    const meta = VERDICT_META[state];
    const text = s.id in applied ? applied[s.id] || s.text : s.text;
    parts.push(
      <span
        key={s.id}
        role="button"
        tabIndex={0}
        data-active={activeId === s.id}
        onClick={() => setActiveId(s.id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveId(s.id)}
        className={`sentence ${meta.bg} ${meta.text}`}
        title={meta.label}
      >
        {text}
      </span>,
    );
    cursor = s.end;
  }
  if (cursor < analyzedDraft.length) parts.push(<span key="tail">{analyzedDraft.slice(cursor)}</span>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {(["verified", "exaggeration", "hallucination"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-sm ${VERDICT_META[k].dot}`} />
            {VERDICT_META[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className={`h-2.5 w-2.5 rounded-sm ${VERDICT_META.applied.dot}`} />
          수정 적용
        </span>
        {pending.length > 0 && (
          <button
            onClick={onApplyAll}
            disabled={draftEdited}
            title={draftEdited ? "③ 초안을 직접 수정했습니다. 다시 팩트체크를 실행한 뒤 적용해 주세요." : undefined}
            className="ml-auto rounded-md bg-navy-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            안전 수정안 일괄 적용 ({pending.length})
          </button>
        )}
      </div>

      {draftEdited && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12px] text-amber-900">
          ③ 자소서 초안을 직접 수정했습니다. 수동 편집 내용을 보호하기 위해 원클릭 적용이 잠겼습니다 — 왼쪽에서 <strong>팩트체크 실행</strong>을 눌러 재검증해 주세요.
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-[14.5px] leading-[2.05] whitespace-pre-wrap text-navy-900">
        {parts}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-slate-500">
          판정 카드 · 플래그 {flagged.length}건 / 전체 {sentences.length}문장 (문장을 클릭하면 해당 카드로 이동)
        </h4>
        <div className="space-y-2.5">
          {sentences.map((s) => {
            const state = displayState(s, applied);
            const meta = VERDICT_META[s.status];
            const isFlag = s.status !== "verified";
            if (!isFlag && activeId !== s.id) return null;
            return (
              <div
                key={s.id}
                ref={(el) => {
                  cardRefs.current[s.id] = el;
                }}
                onClick={() => setActiveId(s.id)}
                className={`rounded-lg border bg-white p-3.5 transition ${activeId === s.id ? "border-navy-500 ring-2 ring-navy-200" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`${meta.bg} ${meta.text} ${meta.ring}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </Badge>
                  <span className="font-mono text-[11px] text-slate-400">{s.id}</span>
                  <span className="text-[11px] text-slate-500">판정: {s.decidedBy.map((d) => (d === "code" ? "코드" : "LLM")).join(" + ")}</span>
                  {(state === "applied" || state === "deleted") && (
                    <Badge className="bg-sky-50 text-sky-800 ring-sky-200">{state === "deleted" ? "삭제 적용됨" : "수정안 적용됨"}</Badge>
                  )}
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-navy-900">“{s.text}”</p>
                <ul className="mt-2 space-y-1">
                  {s.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-700">
                      <SourceTag source={r.source} />
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
                {s.evidence.length > 0 && (
                  <div className="mt-2 rounded-md bg-emerald-50/70 px-3 py-2 text-[12px] text-emerald-900">
                    <span className="font-semibold">원본 근거 </span>
                    {s.evidence.map((e, i) => (
                      <span key={i} className="block">
                        “{e}”
                      </span>
                    ))}
                  </div>
                )}
                {isFlag && s.suggestion !== undefined && (
                  <div className="mt-2.5 rounded-md border border-navy-100 bg-navy-50/60 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-navy-800">원본 기반 안전 수정안</span>
                      <SourceTag source={s.suggestionSource === "llm" ? "llm" : "rule"} />
                      <button
                        disabled={s.id in applied || draftEdited}
                        title={draftEdited ? "③ 초안을 직접 수정했습니다. 다시 팩트체크를 실행한 뒤 적용해 주세요." : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApply(s.id, s.suggestion ?? "");
                        }}
                        className="ml-auto rounded-md bg-navy-800 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-navy-700 disabled:cursor-default disabled:bg-slate-300"
                      >
                        {s.id in applied ? "적용 완료" : draftEdited ? "재검증 후 적용" : s.suggestion === "" ? "문장 삭제 적용" : "원클릭 적용"}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-navy-950">
                      {s.suggestion === "" ? <span className="text-slate-500">(원본 근거가 없어 이 문장은 삭제를 권장합니다)</span> : s.suggestion}
                    </p>
                    {s.suggestionNote && <p className="mt-1 text-[11px] text-slate-500">{s.suggestionNote}</p>}
                  </div>
                )}
              </div>
            );
          })}
          {flagged.length === 0 && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
              모든 문장이 원본 경험과 일치합니다. 사실 관계 측면의 수정이 필요하지 않습니다 — JD 역량 매트릭스와 보완 로드맵 탭을 확인하세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- 탭 2: JD 역량 매트릭스 ----------------

export function JdMatrixTab({ result }: { result: AnalyzeResult }) {
  const rows = result.roadmap.coverage;
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
        <span className="font-semibold text-navy-900">{result.jd.title}</span>
        <span className="text-slate-300">|</span>
        <span>충족 {count("met")}</span>
        <span>부분 충족 {count("partial")}</span>
        <span>미충족 {count("unmet")}</span>
        <span className="ml-auto text-[11px] text-slate-400">판정 근거: 원본 경험만 사용 (초안 내용은 근거로 인정하지 않음)</span>
      </div>
      {/* 모바일 카드 뷰 */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3.5 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={r.category === "required" ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-navy-700 ring-navy-200"}>
                {r.category === "required" ? "필수" : "우대"}
              </Badge>
              <Badge className={COVERAGE_META[r.status].cls}>{COVERAGE_META[r.status].label}</Badge>
              <SourceTag source={r.source === "llm" ? "llm" : "code"} />
            </div>
            <p className="mt-2 font-medium text-navy-900">{r.text}</p>
            {r.keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {r.keywords.map((k) => (
                  <span
                    key={k}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${r.matched.includes(k) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500 line-through decoration-rose-400"}`}
                  >
                    {k}
                  </span>
                ))}
                {r.logic === "any" && r.keywords.length > 1 && <span className="text-[10px] text-slate-400">(택1)</span>}
              </div>
            )}
            <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{r.evidence}</p>
          </div>
        ))}
      </div>

      {/* 데스크톱 테이블 뷰 */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className="bg-navy-50 text-[11px] uppercase tracking-wide text-navy-700">
            <tr>
              <th className="px-3 py-2 font-semibold">구분</th>
              <th className="px-3 py-2 font-semibold">요구 역량</th>
              <th className="px-3 py-2 font-semibold">키워드</th>
              <th className="px-3 py-2 font-semibold">판정</th>
              <th className="px-3 py-2 font-semibold">근거</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2.5">
                  <Badge className={r.category === "required" ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-navy-700 ring-navy-200"}>
                    {r.category === "required" ? "필수" : "우대"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 font-medium text-navy-900">{r.text}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.keywords.length === 0 && <span className="text-slate-400">—</span>}
                    {r.keywords.map((k) => (
                      <span
                        key={k}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${r.matched.includes(k) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500 line-through decoration-rose-400"}`}
                      >
                        {k}
                      </span>
                    ))}
                    {r.logic === "any" && r.keywords.length > 1 && <span className="text-[10px] text-slate-400">(택1)</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={COVERAGE_META[r.status].cls}>{COVERAGE_META[r.status].label}</Badge>
                </td>
                <td className="px-3 py-2.5 text-[12px] text-slate-600">
                  <div className="flex items-start gap-1.5">
                    <SourceTag source={r.source === "llm" ? "llm" : "code"} />
                    <span>{r.evidence}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- 탭 3: 단기 보완 로드맵 ----------------

export function RoadmapTab({ result }: { result: AnalyzeResult }) {
  const r = result.roadmap;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Badge className="bg-navy-800 text-white ring-navy-800">{r.durationWeeks}주 플랜</Badge>
        <SourceTag source={r.source === "llm" ? "llm" : "rule"} />
        {r.gaps.length > 0 && <span className="text-slate-600">보완 대상: {r.gaps.join(" · ")}</span>}
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] leading-relaxed text-amber-950">
        <span className="font-semibold">정직성 원칙 · </span>
        {r.honestyNote}
      </p>
      <ol className="relative space-y-3 border-l-2 border-navy-100 pl-5">
        {r.weeks.map((w) => (
          <li key={w.week} className="relative">
            <span className="absolute -left-[29px] top-3 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-navy-700" />
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-navy-500">WEEK {w.week}</span>
                <h4 className="text-[14px] font-semibold text-navy-900">{w.title}</h4>
              </div>
              {w.focus.length > 0 && <p className="mt-1 text-[11.5px] text-slate-500">{w.focus.join(" · ")}</p>}
              <ul className="mt-2 space-y-1">
                {w.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" />
                    {a}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 rounded-md bg-navy-50 px-3 py-1.5 text-[12px] text-navy-800">
                <span className="font-semibold">산출물 </span>
                {w.deliverable}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
