import type { ToolApprovalResponse } from '../types/delegated-tool-approval';

export function extractToolApprovalResponseFromChatMessages(
  messages: any[]
): ToolApprovalResponse | undefined {
  for (const msg of messages || []) {
    if (msg?.role !== 'assistant') continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    for (const part of parts) {
      const type: string | undefined = part?.type;
      const state: string | undefined = part?.state;
      const approval = part?.approval;

      if (!type || typeof type !== 'string') continue;
      if (!type.startsWith('tool-')) continue;
      if (state !== 'approval-responded') continue;
      if (!approval || typeof approval !== 'object') continue;

      const approvalId = approval.id;
      const approved = approval.approved;
      if (typeof approvalId !== 'string') continue;
      if (typeof approved !== 'boolean') continue;

      return {
        approvalId,
        approved,
        toolCallId: typeof part.toolCallId === 'string' ? part.toolCallId : undefined,
        toolName:
          typeof part.type === 'string' && part.type.startsWith('tool-')
            ? part.type.slice('tool-'.length)
            : undefined,
      };
    }
  }
  return undefined;
}
