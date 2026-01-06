/**
 * Context breakdown schema definitions.
 *
 * This module defines the breakdown components tracked for each system prompt version.
 * It serves as the single source of truth for:
 * - Component keys and labels
 * - OpenTelemetry span attribute keys
 * - UI visualization colors
 */

/**
 * Defines a single breakdown component for a system prompt version.
 * Each version can define its own set of components.
 */
export interface BreakdownComponentDef {
  /** Unique key for this component (used in breakdown.components map) */
  key: string;
  /** Human-readable label for UI display */
  label: string;
  /** OpenTelemetry span attribute key for this component */
  spanAttribute: string;
  /** Tailwind color class for UI visualization (e.g., 'bg-blue-500') */
  color?: string;
}

/**
 * V1 Breakdown Schema - defines all context components tracked for V1 system prompts.
 * This is the single source of truth for V1 breakdown components.
 */
export const V1_BREAKDOWN_SCHEMA: BreakdownComponentDef[] = [
  {
    key: 'systemPromptTemplate',
    label: 'System Prompt Template',
    spanAttribute: 'context.breakdown.system_template_tokens',
    color: 'bg-blue-500',
  },
  {
    key: 'coreInstructions',
    label: 'Core Instructions',
    spanAttribute: 'context.breakdown.core_instructions_tokens',
    color: 'bg-indigo-500',
  },
  {
    key: 'agentPrompt',
    label: 'Agent Prompt',
    spanAttribute: 'context.breakdown.agent_prompt_tokens',
    color: 'bg-violet-500',
  },
  {
    key: 'toolsSection',
    label: 'Tools (MCP/Function/Relation)',
    spanAttribute: 'context.breakdown.tools_tokens',
    color: 'bg-emerald-500',
  },
  {
    key: 'artifactsSection',
    label: 'Artifacts',
    spanAttribute: 'context.breakdown.artifacts_tokens',
    color: 'bg-amber-500',
  },
  {
    key: 'dataComponents',
    label: 'Data Components',
    spanAttribute: 'context.breakdown.data_components_tokens',
    color: 'bg-orange-500',
  },
  {
    key: 'artifactComponents',
    label: 'Artifact Components',
    spanAttribute: 'context.breakdown.artifact_components_tokens',
    color: 'bg-rose-500',
  },
  {
    key: 'transferInstructions',
    label: 'Transfer Instructions',
    spanAttribute: 'context.breakdown.transfer_instructions_tokens',
    color: 'bg-cyan-500',
  },
  {
    key: 'delegationInstructions',
    label: 'Delegation Instructions',
    spanAttribute: 'context.breakdown.delegation_instructions_tokens',
    color: 'bg-teal-500',
  },
  {
    key: 'thinkingPreparation',
    label: 'Thinking Preparation',
    spanAttribute: 'context.breakdown.thinking_preparation_tokens',
    color: 'bg-purple-500',
  },
  {
    key: 'conversationHistory',
    label: 'Conversation History',
    spanAttribute: 'context.breakdown.conversation_history_tokens',
    color: 'bg-sky-500',
  },
];

/** Span attribute key for total tokens */
export const CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE = 'context.breakdown.total_tokens';

/**
 * Dynamic context breakdown interface.
 * Uses a components map to support different system prompt versions.
 */
export interface ContextBreakdown {
  /** Token counts by component key (version-specific) */
  components: Record<string, number>;
  /** Total estimated tokens */
  total: number;
}

/**
 * Creates an empty context breakdown from a schema definition.
 * @param schema - Array of breakdown component definitions
 */
export function createEmptyBreakdown(schema: BreakdownComponentDef[]): ContextBreakdown {
  const components: Record<string, number> = {};
  for (const def of schema) {
    components[def.key] = 0;
  }
  return { components, total: 0 };
}

/**
 * Calculates the total from all breakdown components and updates the total field.
 * @param breakdown - The context breakdown to calculate total for
 * @returns The breakdown with updated total
 */
export function calculateBreakdownTotal(breakdown: ContextBreakdown): ContextBreakdown {
  breakdown.total = Object.values(breakdown.components).reduce((sum, val) => sum + val, 0);
  return breakdown;
}

/**
 * Parses a context breakdown from span attributes using a schema.
 * @param data - Span attribute data record
 * @param schema - Breakdown schema to use for parsing
 * @returns Parsed context breakdown
 */
export function parseContextBreakdownFromSpan(
  data: Record<string, unknown>,
  schema: BreakdownComponentDef[] = V1_BREAKDOWN_SCHEMA
): ContextBreakdown {
  const breakdown = createEmptyBreakdown(schema);

  for (const def of schema) {
    const value = data[def.spanAttribute];
    breakdown.components[def.key] = typeof value === 'number' ? value : Number(value) || 0;
  }

  const totalValue = data[CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE];
  breakdown.total =
    typeof totalValue === 'number' ? totalValue : Number(totalValue) || 0;

  return breakdown;
}

