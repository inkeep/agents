import type { MessageSelect } from '@inkeep/agents-core';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  fromSubAgentId?: string | null;
}

export function formatMessagesForLLM(messages: MessageSelect[]): LLMMessage[] {
  return messages.map((message) => {
    const role =
      message.role === 'user' ? 'user' : message.role === 'agent' ? 'assistant' : 'system';

    const content =
      typeof message.content === 'object' && message.content && 'text' in message.content
        ? (message.content.text as string)
        : String(message.content || '');

    return {
      role,
      content,
      timestamp: message.createdAt,
      fromSubAgentId: message.fromSubAgentId,
    };
  });
}

export function formatMessagesForLLMContext(messages: MessageSelect[]): string {
  const formattedMessages = formatMessagesForLLM(messages);

  return formattedMessages
    .map((msg) => {
      const roleLabel =
        msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Agent' : 'System';
      const agentInfo = msg.fromSubAgentId ? ` (${msg.fromSubAgentId})` : '';
      return `${roleLabel}${agentInfo}: ${msg.content}`;
    })
    .join('\n\n');
}
