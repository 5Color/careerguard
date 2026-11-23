// 2차 단일 패스 LLM 호출 래퍼 (@google/genai).
// 다중 모델 폴백 체인: 1순위 GEMINI_MODEL → 2순위 GEMINI_FALLBACK_MODEL(기본 gemini-3.8-flash) → (호출부) 오프라인 결정론적 폴백
// 정상 경로에서 LLM 호출은 정확히 1회이며, 1순위 모델이 실패했을 때만 2순위로 1회 재시도한다.
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/** 2순위 안정화 Flash 모델 기본값. gemini-2.5-flash는 신규 API 키에서 404(신규 사용자 미제공)를 반환해 3.8 Flash로 지정 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** @deprecated DEFAULT_GEMINI_MODEL 사용 */
export const DEFAULT_FALLBACK_MODEL = DEFAULT_GEMINI_MODEL;

export interface LlmConfig {
  /** 미지정 시 process.env.GEMINI_API_KEY */
  apiKey?: string;
  /** 1순위 모델. 미지정 시 process.env.GEMINI_MODEL */
  model?: string;
  /** 2순위 모델. 미지정 시 process.env.GEMINI_FALLBACK_MODEL 또는 gemini-3.8-flash */
  fallbackModel?: string;
  /** 모델 1회 시도당 타임아웃 */
  timeoutMs?: number;
}

/** USD / 1M tokens (Google AI 공개 단가 기준 추정치). 단가 미공개 모델은 비용을 추정하지 않는다. */
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
};

export interface ResolvedLlmConfig {
  apiKey?: string;
  /** 시도 순서대로 정렬된 모델 체인 (중복 제거) */
  models: string[];
  timeoutMs: number;
}

export function resolveLlmConfig(cfg?: LlmConfig): ResolvedLlmConfig {
  const env = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const apiKey = (cfg?.apiKey ?? env.GEMINI_API_KEY ?? "").trim() || undefined;
  const primary = (cfg?.model ?? env.GEMINI_MODEL ?? "").trim();
  const fallback = (cfg?.fallbackModel ?? env.GEMINI_FALLBACK_MODEL ?? "").trim() || DEFAULT_GEMINI_MODEL;
  const models = [...new Set([primary, fallback].filter(Boolean))];
  const envTimeout = Number(env.GEMINI_TIMEOUT_MS);
  return { apiKey, models, timeoutMs: cfg?.timeoutMs ?? (envTimeout > 0 ? envTimeout : 25_000) };
}

/** 단가표에 있는 모델만 비용을 추정한다 (없으면 null) */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const id = model.replace(/^models\//, "");
  const key = Object.keys(PRICING)
    .sort((a, b) => b.length - a.length)
    .find((k) => id === k || id.startsWith(`${k}-0`) || id.startsWith(`${k}-preview`));
  if (!key) return null;
  const p = PRICING[key];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export type LlmErrorKind = "no_key" | "quota" | "auth" | "timeout" | "abort" | "network" | "parse" | "model" | "unknown";

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly kind: LlmErrorKind,
    public readonly attempts: ModelAttempt[] = [],
  ) {
    super(message);
  }
}

export interface ModelAttempt {
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  errorKind?: LlmErrorKind;
}

function classify(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/API key not valid|API_KEY_INVALID|401|UNAUTHENTICATED/i.test(msg))
    return new LlmError("Gemini API 키 인증 실패", "auth");
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return new LlmError("Gemini API 쿼터 초과", "quota");
  if (/404|NOT_FOUND|is not found|not supported for generateContent|unsupported model/i.test(msg))
    return new LlmError("모델을 찾을 수 없거나 지원되지 않음", "model");
  if (/403|PERMISSION_DENIED/i.test(msg)) return new LlmError("해당 모델 접근 권한 없음", "model");
  if (/abort|timeout|timed out|DEADLINE_EXCEEDED/i.test(msg)) return new LlmError("응답 시간 초과", "timeout");
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network|EAI_AGAIN/i.test(msg))
    return new LlmError("네트워크 오류로 Gemini에 연결하지 못함", "network");
  if (/400|INVALID_ARGUMENT/i.test(msg)) return new LlmError(`요청 형식 거부: ${msg.slice(0, 120)}`, "model");
  if (/500|503|UNAVAILABLE|INTERNAL|overloaded/i.test(msg)) return new LlmError("Gemini 서버 일시 오류", "network");
  return new LlmError(`Gemini 호출 오류: ${msg.slice(0, 160)}`, "unknown");
}

export interface JsonCallResult<T> {
  data: T;
  /** 요청에 사용한(=성공한) 모델 ID */
  model: string;
  /** API가 실제로 응답한 모델 버전 (response.modelVersion) */
  respondedModel: string;
  /** 1순위 모델 실패로 2순위 모델이 응답했는가 */
  fallbackUsed: boolean;
  attempts: ModelAttempt[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number | null;
}

/**
 * 2.5 Flash 계열: thinkingBudget 0 (끔)
 * 3.x / 4.x 계열: thinkingLevel (GEMINI_THINKING_LEVEL, 기본 LOW). "DEFAULT"면 모델 기본값을 그대로 둔다.
 */
function thinkingFor(model: string): { thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: ThinkingLevel } } {
  if (model.startsWith("gemini-2.5-flash")) return { thinkingConfig: { thinkingBudget: 0 } };
  if (model.startsWith("gemini-2.5")) return {};
  const level = (process.env.GEMINI_THINKING_LEVEL ?? "LOW").trim().toUpperCase();
  if (level === "DEFAULT" || !(level in ThinkingLevel)) return {};
  return { thinkingConfig: { thinkingLevel: level as ThinkingLevel } };
}

async function callOnce<T>(
  ai: GoogleGenAI,
  model: string,
  args: { systemInstruction: string; prompt: string; schema: Record<string, unknown>; signal?: AbortSignal },
  timeoutMs: number,
  withThinking: boolean,
) {
  if (args.signal?.aborted) throw new LlmError("요청이 취소됨", "abort");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  args.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await ai.models.generateContent({
      model,
      contents: args.prompt,
      config: {
        systemInstruction: args.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: args.schema,
        temperature: 0.1,
        abortSignal: controller.signal,
        // 경량 단일 패스: thinking을 최소화해 비용·지연을 줄인다
        ...(withThinking ? thinkingFor(model) : {}),
      },
    });
    const text = res.text ?? "";
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new LlmError("응답 JSON 파싱 실패", "parse");
    }
    return { res, data };
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * JSON Schema 강제(responseMimeType: application/json)로 Gemini를 호출한다.
 * 모델 체인을 순서대로 시도하며, 처음 성공한 응답 하나만 사용한다.
 * 키 인증 실패는 모든 모델에 공통이므로 즉시 중단한다.
 */
export async function callGeminiJson<T>(args: {
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  config?: LlmConfig;
  signal?: AbortSignal;
}): Promise<JsonCallResult<T>> {
  const { apiKey, models, timeoutMs } = resolveLlmConfig(args.config);
  if (!apiKey) throw new LlmError("GEMINI_API_KEY 미설정", "no_key");

  const ai = new GoogleGenAI({ apiKey });
  const attempts: ModelAttempt[] = [];
  let lastErr: LlmError | undefined;

  for (const model of models) {
    if (args.signal?.aborted) throw new LlmError("요청이 취소됨", "abort", attempts);
    const t0 = performance.now();
    try {
      let out: Awaited<ReturnType<typeof callOnce<T>>>;
      try {
        out = await callOnce<T>(ai, model, args, timeoutMs, true);
      } catch (err) {
        if (args.signal?.aborted) throw new LlmError("요청이 취소됨", "abort", attempts);
        // 모델이 thinking 설정을 거부하면(400) 같은 모델에 기본 설정으로 1회만 재시도
        const msg = err instanceof Error ? err.message : String(err);
        if (!/thinking/i.test(msg) || !/400|INVALID_ARGUMENT/i.test(msg)) throw err;
        attempts.push({ model: `${model} (thinking 설정 거부)`, ok: false, latencyMs: Math.round(performance.now() - t0), error: "thinking 설정 미지원 → 기본 설정으로 재시도", errorKind: "model" });
        out = await callOnce<T>(ai, model, args, timeoutMs, false);
      }
      const { res, data } = out;
      const latencyMs = Math.round(performance.now() - t0);
      attempts.push({ model, ok: true, latencyMs });
      const u = res.usageMetadata;
      const inputTokens = u?.promptTokenCount ?? 0;
      const outputTokens = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
      return {
        data,
        model,
        respondedModel: res.modelVersion || model,
        fallbackUsed: model !== models[0],
        attempts,
        latencyMs,
        inputTokens,
        outputTokens,
        estCostUsd: estimateCostUsd(res.modelVersion || model, inputTokens, outputTokens),
      };
    } catch (err) {
      if (args.signal?.aborted || (err instanceof LlmError && err.kind === "abort")) {
        throw new LlmError("요청이 취소됨", "abort", attempts);
      }
      const e = classify(err);
      attempts.push({ model, ok: false, latencyMs: Math.round(performance.now() - t0), error: e.message, errorKind: e.kind });
      lastErr = e;
      if (e.kind === "auth") break;
    }
  }
  const summary = attempts.map((a) => `${a.model}: ${a.error}`).join(" → ");
  throw new LlmError(`모든 모델 호출 실패 (${summary})`, lastErr?.kind ?? "unknown", attempts);
}
