/**
 * Utility to format OpenTelemetry trace data from conversation details
 * into a human-readable, prettified JSON format
 */

import type { ActivityItem, ConversationDetail } from '@/components/traces/timeline/types';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchConversationHistoryAction } from '@/lib/actions/conversations';
import type { FullAgentDefinition } from '@/lib/types/agent-full';

interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PrettifiedTrace {
  metadata: {
    conversationId: string;
    traceId?: string;
    agentId?: string;
    agentName?: string;
    exportedAt: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  agentDefinition?: Record<string, unknown>;
  conversationHistory: SimpleMessage[];
  timeline: Omit<ActivityItem, 'id' | 'parentSpanId'>[];
}

/**
 * Priority fields that should appear first, in this order
 */
const PRIORITY_FIELDS = [
  'subAgentId',
  'subAgentName',
  'type',
  'description',
  'status',
  'timestamp',
];

/**
 * Orders object keys with priority fields first, then alphabetically
 */
function orderObjectKeys<T extends Record<string, any>>(obj: T): T {
  const priorityKeys: string[] = [];
  const remainingKeys: string[] = [];

  for (const key of Object.keys(obj)) {
    if (PRIORITY_FIELDS.includes(key)) {
      priorityKeys.push(key);
    } else {
      remainingKeys.push(key);
    }
  }

  priorityKeys.sort((a, b) => {
    return PRIORITY_FIELDS.indexOf(a) - PRIORITY_FIELDS.indexOf(b);
  });

  remainingKeys.sort();
  const result = {} as T;
  for (const key of [...priorityKeys, ...remainingKeys]) {
    result[key as keyof T] = obj[key as keyof T];
  }

  return result;
}

function extractTextContent(
  content: string | Array<{ type: string; text?: string }>
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('');
}

/**
 * Formats conversation detail data into a prettified OTEL trace structure
 */
function formatConversationAsPrettifiedTrace(
  conversation: ConversationDetail,
  agentDefinition?: FullAgentDefinition,
  messages?: SimpleMessage[]
): PrettifiedTrace {
  const trace: PrettifiedTrace = {
    metadata: {
      conversationId: conversation.conversationId,
      traceId: conversation.traceId,
      agentName: conversation.agentName,
      agentId: conversation.agentId,
      exportedAt: new Date().toISOString(),
    },
    timing: {
      startTime: conversation.conversationStartTime
        ? new Date(conversation.conversationStartTime).toISOString()
        : '',
      endTime: conversation.conversationEndTime
        ? new Date(conversation.conversationEndTime).toISOString()
        : '',
      durationMs: conversation.duration,
    },
    agentDefinition: agentDefinition as Record<string, unknown> | undefined,
    conversationHistory: messages || [],
    timeline: (conversation.activities || []).map((activity) => {
      const { id: _id, parentSpanId: _parentSpanId, ...rest } = activity;
      return orderObjectKeys(rest);
    }),
  };

  return trace;
}

/**
 * Copies the prettified trace to clipboard with compact defaults
 */
export async function copyTraceToClipboard(
  conversation: ConversationDetail,
  tenantId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [agentResult, historyResult] = await Promise.all([
      conversation.agentId
        ? getFullAgentAction(tenantId, projectId, conversation.agentId)
        : Promise.resolve(null),
      fetchConversationHistoryAction(tenantId, projectId, conversation.conversationId),
    ]);

    const agentDefinition = agentResult?.success ? agentResult.data : undefined;

    // Extract just user/assistant messages
    const messages: SimpleMessage[] = [];
    if (historyResult?.success && historyResult.data?.messages) {
      for (const msg of historyResult.data.messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          const content = extractTextContent(msg.content);
          if (content) {
            messages.push({ role: msg.role, content });
          }
        }
      }
    }

    const trace = formatConversationAsPrettifiedTrace(conversation, agentDefinition, messages);
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy trace',
    };
  }
}
