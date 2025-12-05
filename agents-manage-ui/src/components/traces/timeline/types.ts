export type PanelType =
  | ActivityKind
  | 'delegation'
  | 'transfer'
  | 'tool_purpose'
  | 'generic_tool'
  | 'mcp_tool_error'
  | 'tool_approval_requested'
  | 'tool_approval_approved'
  | 'tool_approval_denied';

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
  TOOL_APPROVAL_REQUESTED: 'tool_approval_requested',
  TOOL_APPROVAL_APPROVED: 'tool_approval_approved',
  TOOL_APPROVAL_DENIED: 'tool_approval_denied',
} as const;

export type ActivityKind = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export interface ActivityItem {
  id: string;
  type: ActivityKind;
  name?: string;
  description: string;
  timestamp: string;
  parentSpanId?: string | null;
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
  toolStatusMessage?: string;
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
  // Tool approval fields
  approvalToolName?: string;
  approvalToolCallId?: string;
  // Context breakdown for AI generation spans
  contextBreakdown?: ContextBreakdown;
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

/** Context breakdown showing estimated token usage by component */
export interface ContextBreakdown {
  /** Base system prompt template tokens */
  systemPromptTemplate: number;
  /** Core instructions (corePrompt) tokens */
  coreInstructions: number;
  /** Agent-level context (prompt) tokens */
  agentPrompt: number;
  /** Tools section (MCP, function, relation tools) tokens */
  toolsSection: number;
  /** Artifacts section tokens */
  artifactsSection: number;
  /** Data components section tokens (Phase 2) */
  dataComponents: number;
  /** Artifact component instructions tokens */
  artifactComponents: number;
  /** Transfer instructions tokens */
  transferInstructions: number;
  /** Delegation instructions tokens */
  delegationInstructions: number;
  /** Thinking preparation instructions tokens */
  thinkingPreparation: number;
  /** Conversation history tokens */
  conversationHistory: number;
  /** Total estimated tokens */
  total: number;
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
