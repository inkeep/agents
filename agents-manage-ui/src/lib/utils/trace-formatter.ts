/**
 * Utility to format OpenTelemetry trace data from conversation details
 * into a human-readable, prettified JSON format
 */

import type { ActivityItem, ConversationDetail } from '@/components/traces/timeline/types';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchConversationHistoryAction } from '@/lib/actions/conversations';
import type { FullAgentDefinition } from '@/lib/types/agent-full';

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
  conversationHistory: string;
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

/**
 * Formats conversation detail data into a prettified OTEL trace structure
 */
function formatConversationAsPrettifiedTrace(
  conversation: ConversationDetail,
  agentDefinition?: FullAgentDefinition,
  conversationHistory?: string
): PrettifiedTrace {
  return {
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
    conversationHistory: conversationHistory || '',
    timeline: (conversation.activities || []).map((activity) => {
      const { id: _id, parentSpanId: _parentSpanId, ...rest } = activity;
      return orderObjectKeys(rest);
    }),
  };
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
    const conversationHistory = historyResult?.success ? historyResult.data?.formatted?.llmContext : '';

    const trace = formatConversationAsPrettifiedTrace(conversation, agentDefinition, conversationHistory);
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy trace',
    };
  }
}
