export type PanelType =
  | ActivityKind
  | 'delegation'
  | 'transfer'
  | 'tool_purpose'
  | 'generic_tool'
  | 'mcp_tool_error';

export type MCPError = NonNullable<ConversationDetail['mcpToolErrors']>[number];

export type SelectedPanel =
  | { type: Exclude<PanelType, 'mcp_tool_error'>; item: ActivityItem }
  | { type: 'mcp_tool_error'; item: MCPError };

export const ACTIVITY_TYPES = {
  TOOL_CALL: 'tool_call',
  AI_GENERATION: 'ai_generation',
  AGENT_GENERATION: 'agent_generation',
  CONTEXT_FETCH: 'context_fetch',
  CONTEXT_RESOLUTION: 'context_resolution',
  USER_MESSAGE: 'user_message',
  AI_ASSISTANT_MESSAGE: 'ai_assistant_message',
  AI_MODEL_STREAMED_TEXT: 'ai_model_streamed_text',
  AI_MODEL_STREAMED_OBJECT: 'ai_model_streamed_object',
  ARTIFACT_PROCESSING: 'artifact_processing',
} as const;

export type ActivityKind = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export interface ActivityItem {
  id: string;
  type: ActivityKind;
  name?: string;
  description: string;
  timestamp: string;
  subAgentId?: string;
  subAgentName?: string;
  toolName?: string;
  toolResult?: string;
  status: 'success' | 'error' | 'pending';
  toolDescription?: string;
  result?: string;
  saveResultSaved?: boolean;
  saveArtifactType?: string;
  saveArtifactName?: string;
  saveArtifactDescription?: string;
  saveTotalArtifacts?: number;
  saveSummaryData?: Record<string, any>;
  saveOperationId?: string;
  saveToolCallId?: string;
  saveFunctionId?: string;
  saveFacts?: string;
  saveToolArgs?: Record<string, any>;
  saveFullResult?: Record<string, any>;
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  serviceTier?: string;
  aiResponseContent?: string;
  aiResponseTimestamp?: string;
  messageContent?: string;
  delegationFromSubAgentId?: string;
  delegationToSubAgentId?: string;
  transferFromSubAgentId?: string;
  transferToSubAgentId?: string;
  toolType?: string;
  toolPurpose?: string;
  contextConfigId?: string;
  contextAgentId?: string;
  contextRequestKeys?: string[];
  contextTrigger?: string;
  contextStatusDescription?: string;
  contextUrl?: string;
  hasError?: boolean;
  spanName?: string;
  aiStreamTextContent?: string;
  aiStreamTextModel?: string;
  aiStreamTextProvider?: string;
  aiStreamTextOperationId?: string;
  aiStreamObjectContent?: string;
  aiStreamObjectModel?: string;
  aiStreamObjectProvider?: string;
  aiStreamObjectOperationId?: string;
  toolCallArgs?: string;
  toolCallResult?: string;
  aiResponseText?: string;
  aiResponseToolCalls?: string;
  aiPromptMessages?: string;
  traceId?: string;
  // OTEL status fields
  otelStatusCode?: string;
  otelStatusDescription?: string;
  aiTelemetryFunctionId?: string;
  // Artifact processing fields
  artifactId?: string;
  artifactType?: string;
  artifactName?: string;
  artifactDescription?: string;
  artifactData?: string;
  artifactSubAgentId?: string;
  artifactToolCallId?: string;
}

export interface ToolCall {
  toolName: string;
  toolType: string;
  timestamp: string;
  duration?: number;
  status: 'success' | 'error' | 'pending';
  arguments?: any;
  result?: any;
  id?: string;
  subAgentId?: string;
  agentName?: string;
  toolDescription?: string;
}

export interface AgentInteraction {
  subAgentId: string;
  agentName: string;
  timestamp: string;
  messageCount: number;
  toolCalls: ToolCall[];
}

export interface ConversationDetail {
  conversationId: string;
  startTime: string;
  endTime?: string;
  duration: number;
  totalMessages: number;
  totalToolCalls: number;
  totalErrors: number;
  totalOpenAICalls: number;
  agents: AgentInteraction[];
  transfers: number;
  delegations: number;
  status: 'active' | 'completed' | 'error';
  toolCalls?: ActivityItem[];
  activities?: ActivityItem[];
  conversationStartTime?: string | null;
  conversationEndTime?: string | null;
  conversationDuration?: number;
  operationTime?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  traceId?: string;
  agentId?: string;
  agentName?: string;
  spansWithErrorsCount?: number;
  errorCount?: number;
  warningCount?: number;
  allSpanAttributes?: Array<{
    spanId: string;
    traceId: string;
    timestamp: string;
    data: Record<string, any>;
  }>;
  mcpToolErrors?: Array<{
    id: string;
    spanId: string;
    toolName: string;
    error: string;
    failureReason: string;
    timestamp: string;
  }>;
}

export const TOOL_TYPES = {
  TRANSFER: 'transfer',
  DELEGATION: 'delegation',
  MCP: 'mcp',
  TOOL: 'tool',
} as const;
