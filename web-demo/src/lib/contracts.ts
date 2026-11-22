// 서버(pipeline/route) ↔ 클라이언트(page) 공유 계약 타입. 런타임 코드 없음.
import type { GapRoadmap, JdMatrix, VerifyResult } from "@careerguard/mcp-server/core";

export type AnalyzeMode = "auto" | "offline";

export interface AnalyzeRequest {
  jd: string;
  raw: string;
  draft: string;
  mode?: AnalyzeMode;
}

export type LogStatus = "running" | "done" | "fallback" | "skipped" | "error";

export interface LogStep {
  id: string;
  /** MCP Tool 이름 또는 단계 이름 */
  tool: string;
  title: string;
  status: LogStatus;
  /** 파이프라인 시작 기준 오프셋(ms) */
  atMs: number;
  durationMs: number;
  input: string;
  output: string;
  /** 비용 표기 (예: "$0 · 코드", "LLM 1회") */
  cost: string;
  /** 실제 응답한 모델 (LLM 단계) */
  model?: string;
}

export interface AnalyzeResult {
  jd: JdMatrix;
  verify: VerifyResult;
  roadmap: GapRoadmap;
  logs: LogStep[];
  totalMs: number;
  mode: "hybrid" | "offline";
  /** 시도 순서대로의 모델 체인 (1순위 → 2순위) */
  modelChain: string[];
  /** 실제로 응답한 모델 (offline이면 undefined) */
  respondedModel?: string;
  efficiency: string;
  skill: { name: string; chars: number; guardrails: number };
}

export type StreamEvent =
  | { type: "log"; log: LogStep }
  | { type: "result"; result: AnalyzeResult }
  | { type: "error"; message: string };
