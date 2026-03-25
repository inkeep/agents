type MaybeString = string | null | undefined;

type McpGraphKeyArgs = {
  relationshipId?: MaybeString;
  subAgentId?: MaybeString;
  toolId?: MaybeString;
  fallbackId?: MaybeString;
};

type RequiredMcpGraphKeyArgs =
  | (McpGraphKeyArgs & { relationshipId: string })
  | (McpGraphKeyArgs & { toolId: string })
  | (McpGraphKeyArgs & { fallbackId: string });

type FunctionToolGraphKeyArgs = {
  toolId?: MaybeString;
  relationshipId?: MaybeString;
  fallbackId?: MaybeString;
};

type RequiredFunctionToolGraphKeyArgs =
  | (FunctionToolGraphKeyArgs & { toolId: string })
  | (FunctionToolGraphKeyArgs & { relationshipId: string })
  | (FunctionToolGraphKeyArgs & { fallbackId: string });

function getPrefixedGraphKey(prefix: string, value: string): string;
function getPrefixedGraphKey(prefix: string, value: MaybeString): string | null;
function getPrefixedGraphKey(prefix: string, value: MaybeString): string | null {
  return value ? `${prefix}:${value}` : null;
}

export function getSubAgentGraphKey(val: string): string;
export function getSubAgentGraphKey(val: MaybeString): string | null;
export function getSubAgentGraphKey(subAgentId: MaybeString) {
  return getPrefixedGraphKey('sub-agent', subAgentId);
}

export function getPlaceholderGraphKey(placeholderType: string, nodeId: string): string {
  return `${placeholderType}:${nodeId}`;
}

export function getMcpGraphKey(args: RequiredMcpGraphKeyArgs): string;
export function getMcpGraphKey(args: McpGraphKeyArgs): string | null;
export function getMcpGraphKey({
  relationshipId,
  subAgentId,
  toolId,
  fallbackId,
}: McpGraphKeyArgs): string | null {
  if (relationshipId) {
    return `mcp:${relationshipId}`;
  }

  if (fallbackId?.startsWith('mcp:')) {
    return fallbackId;
  }

  if (toolId) {
    if (subAgentId) {
      return `mcp:${subAgentId}:${toolId}`;
    }

    if (fallbackId) {
      return `mcp:${toolId}:${fallbackId}`;
    }

    return `mcp:${toolId}`;
  }

  return fallbackId ? `mcp:${fallbackId}` : null;
}

export function getFunctionToolGraphKey(args: RequiredFunctionToolGraphKeyArgs): string;
export function getFunctionToolGraphKey(args: FunctionToolGraphKeyArgs): string | null;
export function getFunctionToolGraphKey({
  relationshipId,
  toolId,
  fallbackId,
}: FunctionToolGraphKeyArgs): string | null {
  return getPrefixedGraphKey('function-tool', toolId ?? relationshipId ?? fallbackId);
}

export function getExternalAgentGraphKey(val: string): string;
export function getExternalAgentGraphKey(val: MaybeString): string | null;
export function getExternalAgentGraphKey(externalAgentId: MaybeString) {
  return getPrefixedGraphKey('external-agent', externalAgentId);
}

export function getTeamAgentGraphKey(val: string): string;
export function getTeamAgentGraphKey(val: MaybeString): string | null;
export function getTeamAgentGraphKey(teamAgentId: MaybeString) {
  return getPrefixedGraphKey('team-agent', teamAgentId);
}
