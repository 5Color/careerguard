// web-demo 등 외부에서 import 하는 코어 진입점 (`@careerguard/mcp-server/core`)
export * from "../types.ts";
export { extractJdMatrix } from "./extractJdMatrix.ts";
export {
  verifyEvidence,
  runDeterministicCheck,
  sanitizeSuggestion,
  DEFAULT_GUARDRAILS,
  type VerifyInput,
} from "./verifyEvidence.ts";
export { buildGapRoadmap, jdRuleCoverage, HONESTY_NOTE, type BuildGapRoadmapInput } from "./buildGapRoadmap.ts";
export { DEFAULT_GEMINI_MODEL, estimateCostUsd, resolveLlmConfig, type LlmConfig } from "./gemini.ts";
export { LLM_RESPONSE_SCHEMA } from "./verifyEvidence.ts";
