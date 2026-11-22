"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMPLES, type Sample } from "@/lib/samples";
import type { AnalyzeMode, AnalyzeResult, LogStep, StreamEvent } from "@/lib/contracts";
import { FactCheckTab, JdMatrixTab, PipelineLog, RoadmapTab, SummaryCards } from "@/components/results";
import { PluginModal } from "@/components/plugin-modal";
import { Card } from "@/components/ui";

type Tab = "fact" | "jd" | "roadmap";

function rebuildDraft(base: string, result: AnalyzeResult, applied: Record<string, string>): string {
  let out = base;
  const sorted = [...result.verify.sentences].sort((a, b) => b.start - a.start);
  for (const s of sorted) {
    if (!(s.id in applied)) continue;
    const rep = applied[s.id];
    let end = s.end;
    // 삭제 시 뒤따르는 공백 하나도 함께 제거
    if (rep === "" && out[end] === " ") end += 1;
    out = out.slice(0, s.start) + rep + out.slice(end);
  }
  return out;
}

export default function Home() {
  const [sampleId, setSampleId] = useState<string | null>(SAMPLES[0].id);
  const [jd, setJd] = useState(SAMPLES[0].jd);
  const [raw, setRaw] = useState(SAMPLES[0].raw);
  const [draft, setDraft] = useState(SAMPLES[0].draft);
  const [mode, setMode] = useState<AnalyzeMode>("auto");

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogStep[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [analyzedDraft, setAnalyzedDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("fact");
  const [pluginOpen, setPluginOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef(false);

  const analyze = useCallback(
    async (input: { jd: string; raw: string; draft: string; mode: AnalyzeMode }) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setRunning(true);
      setError(null);
      setLogs([]);
      setResult(null);
      setApplied({});
      setActiveId(null);
      setAnalyzedDraft(input.draft.trim());
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `요청 실패 (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as StreamEvent;
            if (ev.type === "log") {
              setLogs((prev) => {
                const i = prev.findIndex((p) => p.id === ev.log.id);
                if (i < 0) return [...prev, ev.log];
                const next = [...prev];
                next[i] = ev.log;
                return next;
              });
            } else if (ev.type === "result") {
              setResult(ev.result);
              setLogs(ev.result.logs);
              const firstFlag = ev.result.verify.sentences.find((s) => s.status !== "verified");
              setActiveId(firstFlag?.id ?? null);
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (abortRef.current === ac) setRunning(false);
      }
    },
    [],
  );

  // 페이지 진입 시 샘플 1 자동 로드 + 자동 실행 (심사위원 10초 체험)
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const s = SAMPLES[0];
    void analyze({ jd: s.jd, raw: s.raw, draft: s.draft, mode: "auto" });
  }, [analyze]);

  const loadSample = (s: Sample) => {
    setSampleId(s.id);
    setJd(s.jd);
    setRaw(s.raw);
    setDraft(s.draft);
    setTab("fact");
    void analyze({ jd: s.jd, raw: s.raw, draft: s.draft, mode });
  };

  const applyFix = (id: string, text: string) => {
    if (!result) return;
    const next = { ...applied, [id]: text };
    setApplied(next);
    setDraft(rebuildDraft(analyzedDraft, result, next));
  };
  const applyAll = () => {
    if (!result) return;
    const next = { ...applied };
    for (const s of result.verify.sentences) {
      if (s.status !== "verified" && s.suggestion !== undefined && !(s.id in next)) next[s.id] = s.suggestion;
    }
    setApplied(next);
    setDraft(rebuildDraft(analyzedDraft, result, next));
  };

  const appliedCount = Object.keys(applied).length;

  return (
    <div className="flex min-h-screen flex-col">
      {/* 헤더 */}
      <header className="border-b border-navy-800 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg font-black text-navy-900">✓</div>
            <div>
              <h1 className="text-[17px] font-bold leading-tight tracking-tight">
                CareerGuard <span className="font-medium text-navy-300">자소서 팩트체크</span>
              </h1>
              <p className="text-[11px] text-navy-300">팀 펙트체커 · MCP + Skill 하이브리드 단일 패스 검증</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-violet-500/15 px-2.5 py-1 font-semibold text-violet-100 ring-1 ring-violet-300/40">
              🤖 AI가 생성·검증한 결과입니다 (인공지능기본법 제31조 준수 안내)
            </span>
            <span className="rounded-full bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-100 ring-1 ring-amber-300/40">
              ⚠ 실제 개인정보 입력 금지 · 가상 샘플 데이터 사용
            </span>
          </div>
          <button
            onClick={() => setPluginOpen(true)}
            className="ml-auto rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-navy-900 shadow-sm hover:bg-navy-50"
          >
            {"</>"} 플러그인 패키지 보기
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(340px,5fr)_7fr]">
        {/* 좌: 입력 */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-bold text-navy-900">원클릭 가상 샘플</h2>
            <div className="mt-2.5 grid gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSample(s)}
                  disabled={running}
                  className={`rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-60 ${sampleId === s.id ? "border-navy-600 bg-navy-50 ring-1 ring-navy-600" : "border-slate-200 hover:border-navy-300 hover:bg-slate-50"}`}
                >
                  <span className="block text-[13px] font-semibold text-navy-900">{s.label}</span>
                  <span className="block text-[11.5px] text-slate-500">
                    {s.persona} · {s.scenario}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            {[
              { label: "① 채용공고 (JD)", value: jd, set: setJd, rows: 8 },
              { label: "② 원본 경험 (raw_experience · 유일한 근거)", value: raw, set: setRaw, rows: 8 },
              { label: "③ 자소서 초안 (draft_text · 검증 대상)", value: draft, set: setDraft, rows: 8 },
            ].map((f) => (
              <label key={f.label} className="block">
                <span className="flex items-center justify-between text-[12px] font-semibold text-navy-800">
                  {f.label}
                  <span className="font-mono text-[10.5px] font-normal text-slate-400">{f.value.length.toLocaleString()}/5,000</span>
                </span>
                <textarea
                  value={f.value}
                  maxLength={5000}
                  rows={f.rows}
                  onChange={(e) => {
                    f.set(e.target.value);
                    setSampleId(null);
                  }}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12.5px] leading-relaxed text-navy-950 outline-none focus:border-navy-500 focus:bg-white focus:ring-2 focus:ring-navy-100"
                />
              </label>
            ))}
            {appliedCount > 0 && (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-[11.5px] text-sky-900">
                수정안 {appliedCount}건이 ③ 초안에 반영되었습니다. 다시 실행하면 수정본을 재검증합니다.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11.5px] font-semibold">
                {(
                  [
                    { k: "auto", l: "하이브리드 (코드 + LLM)" },
                    { k: "offline", l: "오프라인 (코드만)" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.k}
                    onClick={() => setMode(m.k)}
                    className={`rounded-md px-2.5 py-1.5 ${mode === m.k ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"}`}
                  >
                    {m.l}
                  </button>
                ))}
              </div>
              <button
                onClick={() => analyze({ jd, raw, draft, mode })}
                disabled={running || !jd.trim() || !raw.trim() || !draft.trim()}
                className="ml-auto rounded-lg bg-navy-800 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-navy-700 disabled:bg-slate-300"
              >
                {running ? "검증 중…" : "팩트체크 실행"}
              </button>
            </div>
          </Card>
        </div>

        {/* 우: 결과 */}
        <div className="min-w-0 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
          )}
          {result ? (
            <SummaryCards result={result} />
          ) : (
            <Card className="flex items-center gap-3 px-4 py-6 text-[13px] text-slate-500">
              {running ? (
                <>
                  <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-navy-500" />
                  1차 코드 검증은 즉시 끝나고, LLM 의미 검증 응답을 기다리는 중입니다…
                </>
              ) : (
                "왼쪽에서 샘플을 고르거나 직접 입력한 뒤 팩트체크를 실행하세요."
              )}
            </Card>
          )}

          <PipelineLog logs={logs} running={running} />

          {result && (
            <Card className="overflow-hidden">
              <div className="flex border-b border-slate-200 bg-slate-50 px-2 pt-2" role="tablist">
                {(
                  [
                    { k: "fact", l: "팩트체크 리포트" },
                    { k: "jd", l: "JD 역량 매트릭스" },
                    { k: "roadmap", l: "단기 보완 로드맵" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.k}
                    role="tab"
                    aria-selected={tab === t.k}
                    onClick={() => setTab(t.k)}
                    className={`rounded-t-lg px-4 py-2.5 text-[13px] font-semibold ${tab === t.k ? "border border-b-white border-slate-200 bg-white text-navy-900 -mb-px" : "text-slate-500 hover:text-navy-700"}`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="p-4 sm:p-5">
                {tab === "fact" && (
                  <FactCheckTab
                    result={result}
                    analyzedDraft={analyzedDraft}
                    applied={applied}
                    onApply={applyFix}
                    onApplyAll={applyAll}
                    activeId={activeId}
                    setActiveId={setActiveId}
                  />
                )}
                {tab === "jd" && <JdMatrixTab result={result} />}
                {tab === "roadmap" && <RoadmapTab result={result} />}
              </div>
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[11px] text-slate-500">
        본 결과는 AI(규칙 기반 코드 검증 + 생성형 AI)가 생성·검증한 참고 자료이며 최종 판단과 책임은 작성자에게 있습니다 · 입력값은 저장하지 않습니다 · 모든 샘플은 가상 데이터입니다
      </footer>

      <PluginModal open={pluginOpen} onClose={() => setPluginOpen(false)} />
    </div>
  );
}
