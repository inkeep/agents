/**
 * Token estimation utility for context tracking.
 *
 * Uses character-based approximation (~4 characters per token) which:
 * - Works universally for all models (OpenAI, Anthropic, Gemini, custom)
 * - Requires no external dependencies
 * - Is fast (simple string length calculation)
 * - Is accurate enough for relative comparisons between context components
 */

// Average ~4 characters per token across most LLM tokenizers (BPE-based)
const CHARS_PER_TOKEN = 4;

/**
 * Breakdown of estimated token usage for each context component.
 * All values are approximate token counts.
 */
export interface ContextBreakdown {
  /** Base system prompt template tokens */
  systemPromptTemplate: number;
  /** Core instructions (corePrompt) tokens */
  coreInstructions: number;
  /** Agent-level context (prompt) tokens */
  agentPrompt: number;
  /** Tools section (MCP, function, relation tools) tokens */
  toolsSection: number;
  /** Artifacts section tokens */
  artifactsSection: number;
  /** Data components section tokens (Phase 2) */
  dataComponents: number;
  /** Artifact component instructions tokens */
  artifactComponents: number;
  /** Transfer instructions tokens */
  transferInstructions: number;
  /** Delegation instructions tokens */
  delegationInstructions: number;
  /** Thinking preparation instructions tokens */
  thinkingPreparation: number;
  /** Conversation history tokens */
  conversationHistory: number;
  /** Total estimated tokens */
  total: number;
}

/**
 * Creates an empty context breakdown with all values set to 0.
 */
export function createEmptyBreakdown(): ContextBreakdown {
  return {
    systemPromptTemplate: 0,
    coreInstructions: 0,
    agentPrompt: 0,
    toolsSection: 0,
    artifactsSection: 0,
    dataComponents: 0,
    artifactComponents: 0,
    transferInstructions: 0,
    delegationInstructions: 0,
    thinkingPreparation: 0,
    conversationHistory: 0,
    total: 0,
  };
}

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
 * Calculates the total from all breakdown components and updates the total field.
 *
 * @param breakdown - The context breakdown to calculate total for
 * @returns The breakdown with updated total
 */
export function calculateBreakdownTotal(breakdown: ContextBreakdown): ContextBreakdown {
  breakdown.total =
    breakdown.systemPromptTemplate +
    breakdown.coreInstructions +
    breakdown.agentPrompt +
    breakdown.toolsSection +
    breakdown.artifactsSection +
    breakdown.dataComponents +
    breakdown.artifactComponents +
    breakdown.transferInstructions +
    breakdown.delegationInstructions +
    breakdown.thinkingPreparation +
    breakdown.conversationHistory;

  return breakdown;
}

/**
 * Result from prompt assembly that includes both the prompt and token breakdown.
 */
export interface AssembleResult {
  /** The assembled prompt string */
  prompt: string;
  /** Token breakdown for each component */
  breakdown: ContextBreakdown;
}
