export function getSubAgentGraphKey(val: string): string;
export function getSubAgentGraphKey(val?: null): null;
export function getSubAgentGraphKey(subAgentId?: string | null) {
  return subAgentId ? `sub-agent:${subAgentId}` : null;
}

export function getMcpGraphKey(args: { relationshipId: string }): string;
export function getMcpGraphKey(args: { subAgentId: string }): string;
export function getMcpGraphKey(args: { toolId: string }): string;
export function getMcpGraphKey(args: { fallbackId: string }): string;
// If nothing is provided or all null/undefined → return null
export function getMcpGraphKey(args: {
  relationshipId?: null;
  subAgentId?: null;
  toolId?: null;
  fallbackId?: null;
}): null;
export function getMcpGraphKey({
  relationshipId,
  subAgentId,
  toolId,
  fallbackId,
}: {
  relationshipId?: string | null;
  subAgentId?: string | null;
  toolId?: string | null;
  fallbackId?: string | null;
}) {
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

export function getFunctionToolGraphKey(args: { toolId: string }): string;
export function getFunctionToolGraphKey(args: { relationshipId: string }): string;
export function getFunctionToolGraphKey(args: { fallbackId: string }): string;
// If nothing is provided or all null/undefined → return null
export function getFunctionToolGraphKey(args: {
  toolId?: null;
  relationshipId?: null;
  fallbackId?: null;
}): null;
export function getFunctionToolGraphKey({
  relationshipId,
  toolId,
  fallbackId,
}: {
  relationshipId?: string | null;
  toolId?: string | null;
  fallbackId?: string | null;
}) {
  if (toolId) {
    return `function-tool:${toolId}`;
  }

  if (relationshipId) {
    return `function-tool:${relationshipId}`;
  }

  return fallbackId ? `function-tool:${fallbackId}` : null;
}

export function getExternalAgentGraphKey(val: string): string;
export function getExternalAgentGraphKey(val?: null): null;
export function getExternalAgentGraphKey(externalAgentId?: string | null) {
  return externalAgentId ? `external-agent:${externalAgentId}` : null;
}

export function getTeamAgentGraphKey(val: string): string;
export function getTeamAgentGraphKey(val?: null): null;
export function getTeamAgentGraphKey(teamAgentId?: string | null) {
  return teamAgentId ? `team-agent:${teamAgentId}` : null;
}
