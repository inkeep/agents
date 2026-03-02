export const INKEEP_TOOL_DENIED_KEY = '__inkeepToolDenied';
export const INKEEP_TOOL_PAUSED_KEY = '__inkeepToolPaused';

export interface DeniedToolResult {
  [INKEEP_TOOL_DENIED_KEY]: true;
  toolCallId: string;
  reason?: string;
}

export interface PausedToolResult {
  [INKEEP_TOOL_PAUSED_KEY]: true;
  interactionId: string;
  toolCallId: string;
  toolName: string;
}

export function isToolResultDenied(result: unknown): result is DeniedToolResult {
  return (
    !!result &&
    typeof result === 'object' &&
    INKEEP_TOOL_DENIED_KEY in result &&
    result[INKEEP_TOOL_DENIED_KEY] === true
  );
}

export function isToolResultPaused(result: unknown): result is PausedToolResult {
  return (
    !!result &&
    typeof result === 'object' &&
    INKEEP_TOOL_PAUSED_KEY in result &&
    result[INKEEP_TOOL_PAUSED_KEY] === true
  );
}

export function createDeniedToolResult(toolCallId: string, reason?: string): DeniedToolResult {
  return {
    [INKEEP_TOOL_DENIED_KEY]: true,
    toolCallId,
    reason,
  };
}

export function createPausedToolResult(
  interactionId: string,
  toolCallId: string,
  toolName: string
): PausedToolResult {
  return {
    [INKEEP_TOOL_PAUSED_KEY]: true,
    interactionId,
    toolCallId,
    toolName,
  };
}

export class PausedForInteractionError extends Error {
  public readonly interactionId: string;
  public readonly toolCallId: string;
  public readonly toolName: string;

  constructor(interactionId: string, toolCallId: string, toolName: string) {
    super(`Execution paused for interaction: ${interactionId}`);
    this.name = 'PausedForInteractionError';
    this.interactionId = interactionId;
    this.toolCallId = toolCallId;
    this.toolName = toolName;
  }
}
