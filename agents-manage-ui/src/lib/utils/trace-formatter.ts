/**
 * Utility to format OpenTelemetry trace data from conversation details
 * into a human-readable, prettified JSON format
 */

import type { ConversationDetail } from '@/components/traces/timeline/types';

/**
 * Configuration options for formatting traces
 */
export interface TraceFormatOptions {
  /** Maximum length for string fields before truncation. Default: 500 */
  maxFieldLength?: number;
  /** Parse JSON strings into objects. Default: true */
  parseJsonFields?: boolean;
  /** Remove undefined/null fields from output. Default: true */
  removeEmptyFields?: boolean;
  /** Include AI prompt messages (truncated to maxFieldLength). Default: true */
  includePromptMessages?: boolean;
  /** Include AI response text (truncated to maxFieldLength). Default: true */
  includeAiResponseText?: boolean;
  /** Maximum length for tool arguments/results before truncation. Default: 500 */
  maxToolDataLength?: number;
}

const DEFAULT_OPTIONS: Required<TraceFormatOptions> = {
  maxFieldLength: 500,
  parseJsonFields: true,
  removeEmptyFields: true,
  includePromptMessages: true,
  includeAiResponseText: true,
  maxToolDataLength: 500,
};

/**
 * Truncates a string to maxLength with ellipsis
 */
function truncateString(str: string | undefined, maxLength: number): string | undefined {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}...`;
}

/**
 * Tries to parse a JSON string, returns original if parsing fails
 */
function tryParseJson(value: string | undefined): any {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Truncates long string values within parsed JSON objects/arrays
 * Specifically handles common patterns like message arrays with content fields
 */
function truncateJsonContent(obj: any, maxLength: number): any {
  if (obj === null || obj === undefined) return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => truncateJsonContent(item, maxLength));
  }
  
  // Handle objects
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Truncate 'content' fields specifically
      if (key === 'content' && typeof value === 'string') {
        result[key] = truncateString(value, maxLength);
      } else if (typeof value === 'object') {
        result[key] = truncateJsonContent(value, maxLength);
      } else if (typeof value === 'string' && value.length > maxLength * 2) {
        // Truncate very long string values (2x threshold for non-content fields)
        result[key] = truncateString(value, maxLength * 2);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  
  // Return primitives as-is
  return obj;
}

/**
 * Removes undefined, null, and empty string values from an object
 * Preserves required fields even if they're falsy
 */
function removeEmptyFields<T extends Record<string, any>>(
  obj: T,
  requiredFields: string[] = []
): T {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Always keep required fields
    if (requiredFields.includes(key)) {
      cleaned[key] = value;
    } else if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export interface PrettifiedTrace {
  metadata: {
    conversationId: string;
    traceId?: string;
    agentId?: string;
    agentName?: string;
    exportedAt: string;
  };
  timing: {
    startTime: string | null;
    endTime: string | null;
    durationMs: number;
    conversationDurationMs?: number;
  };
  timeline: Array<{
    type: string;
    description: string;
    timestamp: string;
    status: 'success' | 'error' | 'pending';
    agentId?: string;
    agentName?: string;
    // Tool call specific
    toolName?: string;
    toolType?: string;
    toolPurpose?: string;
    toolCallArgs?: string;
    toolCallResult?: string;
    // AI generation specific
    aiModel?: string;
    inputTokens?: number;
    outputTokens?: number;
    aiResponseText?: string;
    aiResponseToolCalls?: string;
    aiPromptMessages?: string;
    // Message specific
    messageContent?: string;
    aiResponseContent?: string;
    // Context specific
    contextUrl?: string;
    contextConfigId?: string;
    contextStatusDescription?: string;
    // Delegation/Transfer
    delegationFromAgentId?: string;
    delegationToAgentId?: string;
    transferFromAgentId?: string;
    transferToAgentId?: string;
    // Error information
    hasError?: boolean;
    otelStatusCode?: string;
    otelStatusDescription?: string;
    // Artifact/save specific
    saveResultSaved?: boolean;
    saveArtifactType?: string;
    saveArtifactName?: string;
    saveArtifactDescription?: string;
    saveTotalArtifacts?: number;
  }>;
}

/**
 * Formats conversation detail data into a prettified OTEL trace structure
 */
export function formatConversationAsPrettifiedTrace(
  conversation: ConversationDetail,
  options: TraceFormatOptions = {}
): PrettifiedTrace {
  const opts = { ...DEFAULT_OPTIONS, ...options };

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
        : null,
      endTime: conversation.conversationEndTime
        ? new Date(conversation.conversationEndTime).toISOString()
        : null,
      durationMs: conversation.duration,
      conversationDurationMs: conversation.conversationDuration,
    },
    timeline: (conversation.activities || []).map((activity) => {
      const item = {
        type: activity.type,
        description: activity.description,
        timestamp: activity.timestamp,
        status: activity.status,
        agentId: activity.agentId,
        agentName: activity.agentName,
        toolName: activity.toolName,
        toolType: activity.toolType,
        toolPurpose: activity.toolPurpose,
        toolCallArgs: opts.parseJsonFields 
          ? truncateJsonContent(tryParseJson(activity.toolCallArgs), opts.maxToolDataLength)
          : truncateString(activity.toolCallArgs, opts.maxToolDataLength),
        toolCallResult: opts.parseJsonFields
          ? truncateJsonContent(tryParseJson(activity.toolCallResult), opts.maxToolDataLength)
          : truncateString(activity.toolCallResult, opts.maxToolDataLength),
        aiModel: activity.aiModel,
        inputTokens: activity.inputTokens,
        outputTokens: activity.outputTokens,
        aiResponseText: opts.includeAiResponseText
          ? truncateString(activity.aiResponseText, opts.maxFieldLength)
          : undefined,
        aiResponseToolCalls: opts.parseJsonFields
          ? truncateJsonContent(tryParseJson(activity.aiResponseToolCalls), opts.maxFieldLength)
          : truncateString(activity.aiResponseToolCalls, opts.maxFieldLength),
        aiPromptMessages: opts.includePromptMessages
          ? (opts.parseJsonFields
              ? truncateJsonContent(tryParseJson(activity.aiPromptMessages), opts.maxFieldLength)
              : truncateString(activity.aiPromptMessages, opts.maxFieldLength))
          : undefined,
        messageContent: truncateString(activity.messageContent, opts.maxFieldLength),
        aiResponseContent: opts.includeAiResponseText
          ? truncateString(activity.aiResponseContent, opts.maxFieldLength)
          : undefined,
        contextUrl: activity.contextUrl,
        contextConfigId: activity.contextConfigId,
        contextStatusDescription: activity.contextStatusDescription,
        delegationFromAgentId: activity.delegationFromAgentId,
        delegationToAgentId: activity.delegationToAgentId,
        transferFromAgentId: activity.transferFromAgentId,
        transferToAgentId: activity.transferToAgentId,
        hasError: activity.hasError,
        otelStatusCode: activity.otelStatusCode,
        otelStatusDescription: activity.otelStatusDescription,
        saveResultSaved: activity.saveResultSaved,
        saveArtifactType: activity.saveArtifactType,
        saveArtifactName: activity.saveArtifactName,
        saveArtifactDescription: activity.saveArtifactDescription,
        saveTotalArtifacts: activity.saveTotalArtifacts,
      };
      
      // Preserve required fields: type, description, timestamp, status
      return opts.removeEmptyFields 
        ? removeEmptyFields(item, ['type', 'description', 'timestamp', 'status']) 
        : item;
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
  options: TraceFormatOptions = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const trace = formatConversationAsPrettifiedTrace(conversation, options);
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

