/**
 * Utility to format OpenTelemetry trace data from conversation details
 * into a human-readable, prettified JSON format
 */

import {
  ACTIVITY_TYPES,
  type ActivityItem,
  type ActivityKind,
  type ConversationDetail,
} from '@/components/traces/timeline/types';
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
  agentDefinition: Record<string, unknown> | null;
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
    agentDefinition: (agentDefinition as Record<string, unknown>) || null,
    conversationHistory: conversationHistory || '',
    timeline: (conversation.activities || []).map((activity) => {
      const { id: _id, parentSpanId: _parentSpanId, ...rest } = activity;
      return orderObjectKeys(rest);
    }),
  };
}

/**
 * Builds the full trace object (fetches agent definition and conversation history)
 */
export async function buildFullTrace(
  conversation: ConversationDetail,
  tenantId: string,
  projectId: string
) {
  const [agentResult, historyResult] = await Promise.all([
    conversation.agentId
      ? getFullAgentAction(tenantId, projectId, conversation.agentId)
      : Promise.resolve(null),
    fetchConversationHistoryAction(tenantId, projectId, conversation.conversationId),
  ]);

  const agentDefinition = agentResult?.success ? agentResult.data : undefined;
  const conversationHistory = historyResult?.success
    ? historyResult.data?.formatted?.llmContext || ''
    : '';

  return formatConversationAsPrettifiedTrace(conversation, agentDefinition, conversationHistory);
}

/**
 * Copies the full trace (with agent definition) to clipboard
 */
export async function copyFullTraceToClipboard(
  conversation: ConversationDetail,
  tenantId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trace = await buildFullTrace(conversation, tenantId, projectId);
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy trace',
    };
  }
}

/**
 * Config defining which fields are visible on the timeline for each activity type.
 * This mirrors what timeline-item.tsx renders without clicking into details.
 */
const VISIBLE_FIELDS_BY_TYPE: Record<ActivityKind, (keyof ActivityItem)[]> = {
  [ACTIVITY_TYPES.USER_MESSAGE]: ['messageContent', 'messageParts'],
  [ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE]: ['aiResponseContent'],
  [ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT]: ['aiStreamTextContent'],
  [ACTIVITY_TYPES.CONTEXT_FETCH]: ['toolResult'],
  [ACTIVITY_TYPES.CONTEXT_RESOLUTION]: ['contextUrl'],
  [ACTIVITY_TYPES.TOOL_CALL]: [
    'toolName',
    'toolType',
    'toolPurpose',
    'mcpServerName',
    'delegationFromSubAgentId',
    'delegationToSubAgentId',
    'transferFromSubAgentId',
    'transferToSubAgentId',
  ],
  [ACTIVITY_TYPES.ARTIFACT_PROCESSING]: [
    'artifactType',
    'artifactName',
    'artifactDescription',
    'artifactIsOversized',
    'artifactRetrievalBlocked',
    'artifactOriginalTokenSize',
    'artifactContextWindowSize',
  ],
  [ACTIVITY_TYPES.AI_GENERATION]: [],
  [ACTIVITY_TYPES.AGENT_GENERATION]: [],
  [ACTIVITY_TYPES.TOOL_APPROVAL_REQUESTED]: ['approvalToolName'],
  [ACTIVITY_TYPES.TOOL_APPROVAL_APPROVED]: ['approvalToolName'],
  [ACTIVITY_TYPES.TOOL_APPROVAL_DENIED]: ['approvalToolName'],
  [ACTIVITY_TYPES.COMPRESSION]: ['compressionType', 'compressionRatio'],
  [ACTIVITY_TYPES.MAX_STEPS_REACHED]: ['stepsCompleted', 'maxSteps'],
  [ACTIVITY_TYPES.STREAM_LIFETIME_EXCEEDED]: [
    'streamCleanupReason',
    'streamMaxLifetimeMs',
    'streamBufferSizeBytes',
  ],
};

/**
 * Base fields always shown in timeline summaries
 */
const BASE_VISIBLE_FIELDS: (keyof ActivityItem)[] = [
  'type',
  'description',
  'status',
  'timestamp',
  'subAgentId',
  'subAgentName',
];

/**
 * Error/status fields shown when status is error or warning
 */
const ERROR_FIELDS: (keyof ActivityItem)[] = ['otelStatusDescription', 'toolStatusMessage'];

/**
 * Formats an activity to show only what's visible on the timeline (without clicking into details)
 */
function formatActivityForSummary(activity: ActivityItem): Record<string, unknown> {
  const visibleFields = new Set([
    ...BASE_VISIBLE_FIELDS,
    ...(VISIBLE_FIELDS_BY_TYPE[activity.type] || []),
    ...(activity.status === 'error' || activity.status === 'warning' ? ERROR_FIELDS : []),
  ]);

  const summary: Record<string, unknown> = {};

  for (const field of visibleFields) {
    const value = activity[field];
    if (value !== undefined && value !== null && value !== '') {
      summary[field] = value;
    }
  }

  return orderObjectKeys(summary);
}

/**
 * Builds the summarized trace object (fetches agent definition and conversation history)
 */
export async function buildSummarizedTrace(
  conversation: ConversationDetail,
  tenantId: string,
  projectId: string
) {
  const [agentResult, historyResult] = await Promise.all([
    conversation.agentId
      ? getFullAgentAction(tenantId, projectId, conversation.agentId)
      : Promise.resolve(null),
    fetchConversationHistoryAction(tenantId, projectId, conversation.conversationId),
  ]);

  const agentDefinition = agentResult?.success ? agentResult.data : undefined;
  const conversationHistory = historyResult?.success
    ? historyResult.data?.formatted?.llmContext || ''
    : '';

  return {
    metadata: {
      conversationId: conversation.conversationId,
      agentName: conversation.agentName,
      agentId: conversation.agentId,
      exportedAt: new Date().toISOString(),
    },
    agentDefinition: (agentDefinition as Record<string, unknown>) || null,
    conversationHistory: conversationHistory || '',
    timeline: (conversation.activities || []).map(formatActivityForSummary),
  };
}

/**
 * Copies a summarized trace (just what's visible in the timeline) to clipboard
 */
export async function copySummarizedTraceToClipboard(
  conversation: ConversationDetail,
  tenantId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trace = await buildSummarizedTrace(conversation, tenantId, projectId);
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy trace',
    };
  }
}
