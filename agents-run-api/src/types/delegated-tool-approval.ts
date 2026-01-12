export type DelegatedToolApprovalRequest = {
  type: 'delegated_tool_approval_request';
  delegationId: string;
  delegatedAgentBaseUrl: string;
  delegatedSubAgentId: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerMetadata?: unknown;
};

export type ToolApprovalResponse = {
  approvalId: string;
  approved: boolean;
  toolCallId?: string;
  toolName?: string;
};

export type ToolApprovalRoutingRecord = {
  type: 'tool_approval_routing';
  approvalId: string;
  toolCallId: string;
  toolName: string;
  delegationId: string;
  delegatedAgentBaseUrl: string;
  delegatedSubAgentId: string;
  providerMetadata?: unknown;
};

export type PendingToolApprovalRecord = {
  type: 'tool_approval_pending';
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerMetadata?: unknown;
  delegationId?: string;
  originalUserMessage?: string;
};

export function isDelegatedToolApprovalRequest(
  data: unknown
): data is DelegatedToolApprovalRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as any).type === 'delegated_tool_approval_request' &&
    typeof (data as any).approvalId === 'string' &&
    typeof (data as any).toolCallId === 'string' &&
    typeof (data as any).toolName === 'string' &&
    typeof (data as any).delegatedAgentBaseUrl === 'string' &&
    typeof (data as any).delegatedSubAgentId === 'string' &&
    typeof (data as any).delegationId === 'string'
  );
}

export function isToolApprovalResponseData(
  data: unknown
): data is { type: 'tool_approval_response'; approvalId: string; approved: boolean } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as any).type === 'tool_approval_response' &&
    typeof (data as any).approvalId === 'string' &&
    typeof (data as any).approved === 'boolean'
  );
}

