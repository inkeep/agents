import type { ContextBreakdown } from '../constants/context-breakdown';

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface AssembleResult {
  prompt: string;
  breakdown: ContextBreakdown;
}
