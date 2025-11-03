/**
 * Utility to format OpenTelemetry trace data from conversation details
 * into a human-readable, prettified JSON format
 */

import type { ActivityItem, ConversationDetail } from '@/components/traces/timeline/types';

export interface PrettifiedTrace {
  metadata: {
    conversationId: string;
    traceId?: string;
    agentId?: string;
    agentName?: string;
    exportedAt: string;
  };
  timing: {
    startTime: string;
    endTime: string ;
    durationMs: number;
  };
  timeline: Omit<ActivityItem, 'id' | 'timestamp'>[];
}

/**
 * Formats conversation detail data into a prettified OTEL trace structure
 */
export function formatConversationAsPrettifiedTrace(
  conversation: ConversationDetail,
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
      durationMs: conversation.duration
    },
    timeline: (conversation.activities || []).map((activity) => {
        // Destructure to exclude unwanted fields
        const { id: _id, ...rest } = activity;
        return {
          ...rest
        };
      }),
  };

  return trace;
}

/**
 * Converts the trace to a prettified JSON string
 */
export function traceToJSON(trace: PrettifiedTrace, indent = 2): string {
  return JSON.stringify(trace, null, indent);
}

/**
 * Copies the prettified trace to clipboard with compact defaults
 */
export async function copyTraceToClipboard(
  conversation: ConversationDetail,
): Promise<{ success: boolean; error?: string }> {
  try {
    const trace = formatConversationAsPrettifiedTrace(conversation);
    const json = traceToJSON(trace);
    await navigator.clipboard.writeText(json);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy trace',
    };
  }
}
