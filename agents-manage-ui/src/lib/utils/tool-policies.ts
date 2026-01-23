export type ToolPolicies = Record<string, { needsApproval?: boolean }>;

export function toolPolicyNeedsApprovalForTool(
  toolPolicies: ToolPolicies | null | undefined,
  toolName: string
): boolean {
  if (!toolPolicies) return false;
  return toolPolicies['*']?.needsApproval === true || toolPolicies[toolName]?.needsApproval === true;
}

export function toolPoliciesNeedApproval(toolPolicies?: ToolPolicies | null): boolean {
  if (!toolPolicies) return false;
  return Object.values(toolPolicies).some((policy) => policy?.needsApproval === true);
}

