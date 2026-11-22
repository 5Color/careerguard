// POST /api/analyze — 서버 사이드 환경변수로만 Gemini를 호출한다 (키는 응답·클라이언트로 절대 나가지 않음).
// 응답은 NDJSON 스트림: 파이프라인 각 단계 로그가 끝나는 즉시 전송되고, 마지막에 전체 결과가 온다.
import { runPipeline, redact } from "@/lib/pipeline";
import type { AnalyzeRequest, StreamEvent } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 공개 데모 보호: 항목(JD·원본 경험·초안)당 최대 글자 수 */
const MAX_CHARS = 5000; // (route 파일은 Next 지정 필드만 export 가능)

// 공개 데모 남용 방지용 간단한 IP 기반 제한 (서버리스 인스턴스 단위, best-effort)
const WINDOW_MS = 60_000;
const LIMIT = 10; // IP당 분당 호출 수
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Vercel은 x-real-ip / x-forwarded-for 첫 항목에 실제 클라이언트 IP를 넣는다
  const ip =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  if (rateLimited(ip)) return bad(`요청이 너무 많습니다. IP당 분당 ${LIMIT}회까지 가능합니다. 잠시 후 다시 시도해 주세요.`, 429);

  let body: Partial<AnalyzeRequest>;
  try {
    body = await request.json();
  } catch {
    return bad("JSON 본문이 필요합니다.");
  }
  const jd = typeof body.jd === "string" ? body.jd.trim() : "";
  const raw = typeof body.raw === "string" ? body.raw.trim() : "";
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!jd || !raw || !draft) return bad("채용공고, 원본 경험, 자소서 초안을 모두 입력해 주세요.");
  if (jd.length > MAX_CHARS || raw.length > MAX_CHARS || draft.length > MAX_CHARS)
    return bad(`각 입력은 ${MAX_CHARS.toLocaleString()}자 이하로 입력해 주세요.`);
  const mode = body.mode === "offline" ? "offline" : "auto";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const result = await runPipeline({ jd, raw, draft, mode }, (log) => send({ type: "log", log }));
        send({ type: "result", result });
      } catch (err) {
        // 결정론적 단계까지 실패하는 경우는 입력 이상뿐 — 상세 스택/환경 정보는 노출하지 않는다
        console.error("[analyze] pipeline error:", err);
        send({ type: "error", message: redact(err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.") });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
