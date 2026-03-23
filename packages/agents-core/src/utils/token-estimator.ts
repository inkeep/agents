import type { ContextBreakdown } from '../constants/context-breakdown';

const CHARS_PER_TOKEN = 4;

/**
 * @deprecated Use actual AI SDK usage data (`StepResult.usage.inputTokens`) instead.
 * This heuristic (4 chars = 1 token) is inaccurate and should not be used for
 * decision-driving logic. Remaining accepted usages:
 * - distill-utils.ts: lightweight pre-check before distillation LLM call
 * - ConversationCompressor: pre-generation, no step data available yet
 * - PromptConfig context breakdown: telemetry only
 */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface AssembleResult {
  prompt: string;
  breakdown: ContextBreakdown;
}
