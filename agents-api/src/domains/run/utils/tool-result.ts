export const INKEEP_TOOL_DENIED_KEY = '__inkeepToolDenied';

export interface DeniedToolResult {
  [INKEEP_TOOL_DENIED_KEY]: true;
  toolCallId: string;
  reason?: string;
}

export function isToolResultDenied(result: unknown): result is DeniedToolResult {
  return (
    !!result &&
    typeof result === 'object' &&
    INKEEP_TOOL_DENIED_KEY in result &&
    result[INKEEP_TOOL_DENIED_KEY] === true
  );
}

export function createDeniedToolResult(toolCallId: string, reason?: string): DeniedToolResult {
  return {
    [INKEEP_TOOL_DENIED_KEY]: true,
    toolCallId,
    reason,
  };
}
