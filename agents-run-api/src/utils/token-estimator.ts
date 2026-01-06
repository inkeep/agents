/**
 * Token estimation utility for context tracking.
 *
 * Uses character-based approximation (~4 characters per token) which:
 * - Works universally for all models (OpenAI, Anthropic, Gemini, custom)
 * - Requires no external dependencies
 * - Is fast (simple string length calculation)
 * - Is accurate enough for relative comparisons between context components
 */

// Re-export breakdown types and utilities from agents-core
export {
  calculateBreakdownTotal,
  createEmptyBreakdown,
  type BreakdownComponentDef,
  type ContextBreakdown,
} from '@inkeep/agents-core';

// Average ~4 characters per token across most LLM tokenizers (BPE-based)
const CHARS_PER_TOKEN = 4;

/**
 * Estimates the number of tokens in a text string using character-based approximation.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (approximately text.length / 4)
 */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Result from prompt assembly that includes both the prompt and token breakdown.
 */
export interface AssembleResult {
  /** The assembled prompt string */
  prompt: string;
  /** Token breakdown for each component */
  breakdown: import('@inkeep/agents-core').ContextBreakdown;
}
