// OpenTelemetry trace attribute constants
export const DELEGATION_FROM_SUB_AGENT_ID = 'delegation.from_sub_agent_id';
export const DELEGATION_TO_SUB_AGENT_ID = 'delegation.to_sub_agent_id';
export const DELEGATION_ID = 'delegation.id';
export const TRANSFER_FROM_SUB_AGENT_ID = 'transfer.from_sub_agent_id';
export const TRANSFER_TO_SUB_AGENT_ID = 'transfer.to_sub_agent_id';

export const SPAN_NAMES = {
  AI_TOOL_CALL: 'ai.toolCall',
  CONTEXT_RESOLUTION: 'context-resolver.resolve_single_fetch_definition',
  CONTEXT_HANDLE: 'context.handle_context_resolution',
  AGENT_GENERATION: 'agent.generate',
  CONTEXT_FETCHER: 'context-fetcher.http-request',
  ARTIFACT_PROCESSING: 'agent_session.process_artifact',
  TOOL_APPROVAL_REQUESTED: 'tool.approval_requested',
  TOOL_APPROVAL_APPROVED: 'tool.approval_approved',
  TOOL_APPROVAL_DENIED: 'tool.approval_denied',
  COMPRESSOR_SAFE_COMPRESS: 'compressor.safe_compress',
  AGENT_MAX_STEPS_REACHED: 'agent.max_steps_reached',
  STREAM_FORCE_CLEANUP: 'stream.force_cleanup',
} as const;

export const AI_OPERATIONS = {
  GENERATE_TEXT: 'ai.generateText.doGenerate',
  STREAM_TEXT: 'ai.streamText.doStream',
} as const;

/** OpenTelemetry span attribute keys used for tracing */
export const SPAN_KEYS = {
  // Core span attributes
  SPAN_ID: 'spanID',
  TRACE_ID: 'traceID',
  DURATION_NANO: 'durationNano',
  TIMESTAMP: 'timestamp',
  HAS_ERROR: 'hasError',
  STATUS_MESSAGE: 'status_message',
  OTEL_STATUS_CODE: 'otel.status_code',
  OTEL_STATUS_DESCRIPTION: 'otel.status_description',

  // Agent attributesa
  AGENT_ID: 'agent.id',
  AGENT_NAME: 'agent.name',
  TENANT_ID: 'tenant.id',
  PROJECT_ID: 'project.id',
  SUB_AGENT_NAME: 'subAgent.name',
  SUB_AGENT_ID: 'subAgent.id',

  // AI/Agent attributes
  AI_OPERATION_ID: 'ai.operationId',
  AI_RESPONSE_TIMESTAMP: 'ai.response.timestamp',
  AI_RESPONSE_CONTENT: 'ai.response.content',
  AI_RESPONSE_TEXT: 'ai.response.text',
  AI_RESPONSE_OBJECT: 'ai.response.object',
  AI_RESPONSE_MODEL: 'ai.response.model',
  AI_RESPONSE_TOOL_CALLS: 'ai.response.toolCalls',
  AI_PROMPT_MESSAGES: 'ai.prompt.messages',
  AI_MODEL_PROVIDER: 'ai.model.provider',
  AI_TELEMETRY_FUNCTION_ID: 'ai.telemetry.functionId',
  AI_TELEMETRY_SUB_AGENT_ID: 'ai.telemetry.metadata.subAgentId',
  AI_TELEMETRY_SUB_AGENT_NAME: 'ai.telemetry.metadata.subAgentName',
  AI_TELEMETRY_METADATA_PHASE: 'ai.telemetry.metadata.phase',
  AI_MODEL_ID: 'ai.model.id',

  // Tool attributes
  AI_TOOL_CALL_NAME: 'ai.toolCall.name',
  AI_TOOL_CALL_RESULT: 'ai.toolCall.result',
  AI_TOOL_CALL_ARGS: 'ai.toolCall.args',
  AI_TOOL_CALL_ID: 'ai.toolCall.id',
  AI_TOOL_TYPE: 'ai.toolType',
  AI_TOOL_CALL_MCP_SERVER_ID: 'ai.toolCall.mcpServerId',
  AI_TOOL_CALL_MCP_SERVER_NAME: 'ai.toolCall.mcpServerName',
  TOOL_PURPOSE: 'tool.purpose',
  TOOL_NAME: 'tool.name',
  TOOL_CALL_ID: 'tool.callId',
  TOOL_APPROVAL_REASON: 'tool.approval.reason',

  // Token usage
  GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

  // Context attributes
  CONTEXT_URL: 'context.url',
  CONTEXT_CONFIG_ID: 'context.context_config_id',
  CONTEXT_AGENT_ID: 'context.agent_id',
  CONTEXT_HEADERS_KEYS: 'context.headers_keys',

  // Message attributes
  MESSAGE_CONTENT: 'message.content',
  MESSAGE_PARTS: 'message.parts',
  MESSAGE_TIMESTAMP: 'message.timestamp',
  MCP_TOOL_DESCRIPTION: 'mcp.tool.description',

  // Delegation/Transfer attributes
  DELEGATION_FROM_SUB_AGENT_ID,
  DELEGATION_TO_SUB_AGENT_ID,
  DELEGATION_ID,
  DELEGATION_TYPE: 'delegation.type',
  TRANSFER_FROM_SUB_AGENT_ID,
  TRANSFER_TO_SUB_AGENT_ID,

  // HTTP attributes
  HTTP_URL: 'http.url',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_RESPONSE_BODY_SIZE: 'http.response.body_size',

  // Core attributes
  NAME: 'name',
  PARENT_SPAN_ID: 'parentSpanID',
  CONVERSATION_ID: 'conversation.id',

  // Trigger/Invocation attributes
  INVOCATION_TYPE: 'invocation.type',
  INVOCATION_ENTRY_POINT: 'invocation.entryPoint',
  TRIGGER_ID: 'trigger.id',
  TRIGGER_INVOCATION_ID: 'trigger.invocation.id',

  // Artifact processing attributes
  ARTIFACT_ID: 'artifact.id',
  ARTIFACT_TYPE: 'artifact.type',
  ARTIFACT_TOOL_CALL_ID: 'artifact.tool_call_id',
  ARTIFACT_DATA: 'artifact.data',
  ARTIFACT_NAME: 'artifact.name',
  ARTIFACT_DESCRIPTION: 'artifact.description',
  ARTIFACT_IS_OVERSIZED: 'artifact.is_oversized',
  ARTIFACT_RETRIEVAL_BLOCKED: 'artifact.retrieval_blocked',
  ARTIFACT_ORIGINAL_TOKEN_SIZE: 'artifact.original_token_size',
  ARTIFACT_CONTEXT_WINDOW_SIZE: 'artifact.context_window_size',

  // Context breakdown attributes (estimated token counts)
  CONTEXT_BREAKDOWN_SYSTEM_TEMPLATE: 'context.breakdown.system_template_tokens',
  CONTEXT_BREAKDOWN_CORE_INSTRUCTIONS: 'context.breakdown.core_instructions_tokens',
  CONTEXT_BREAKDOWN_AGENT_PROMPT: 'context.breakdown.agent_prompt_tokens',
  CONTEXT_BREAKDOWN_TOOLS: 'context.breakdown.tools_tokens',
  CONTEXT_BREAKDOWN_ARTIFACTS: 'context.breakdown.artifacts_tokens',
  CONTEXT_BREAKDOWN_DATA_COMPONENTS: 'context.breakdown.data_components_tokens',
  CONTEXT_BREAKDOWN_ARTIFACT_COMPONENTS: 'context.breakdown.artifact_components_tokens',
  CONTEXT_BREAKDOWN_TRANSFER_INSTRUCTIONS: 'context.breakdown.transfer_instructions_tokens',
  CONTEXT_BREAKDOWN_DELEGATION_INSTRUCTIONS: 'context.breakdown.delegation_instructions_tokens',
  CONTEXT_BREAKDOWN_THINKING_PREPARATION: 'context.breakdown.thinking_preparation_tokens',
  CONTEXT_BREAKDOWN_CONVERSATION_HISTORY: 'context.breakdown.conversation_history_tokens',
  CONTEXT_BREAKDOWN_TOTAL: 'context.breakdown.total_tokens',
  AGENT_MAX_STEPS_REACHED: 'agent.max_steps_reached',
  AGENT_STEPS_COMPLETED: 'agent.steps_completed',
  AGENT_MAX_STEPS: 'agent.max_steps',

  // Stream lifetime attributes
  STREAM_CLEANUP_REASON: 'stream.cleanup.reason',
  STREAM_MAX_LIFETIME_MS: 'stream.max_lifetime_ms',
  STREAM_BUFFER_SIZE_BYTES: 'stream.buffer_size_bytes',
} as const;

export const UNKNOWN_VALUE = 'unknown' as const;

/** Activity Types */
export const ACTIVITY_TYPES = {
  TOOL_CALL: 'tool_call',
  AI_GENERATION: 'ai_generation',
  AGENT_GENERATION: 'agent_generation',
  CONTEXT_FETCH: 'context_fetch',
  CONTEXT_RESOLUTION: 'context_resolution',
  USER_MESSAGE: 'user_message',
  AI_ASSISTANT_MESSAGE: 'ai_assistant_message',
  AI_MODEL_STREAMED_TEXT: 'ai_model_streamed_text',
  TOOL_APPROVAL_REQUESTED: 'tool_approval_requested',
  TOOL_APPROVAL_APPROVED: 'tool_approval_approved',
  TOOL_APPROVAL_DENIED: 'tool_approval_denied',
  COMPRESSION: 'compression',
  MAX_STEPS_REACHED: 'max_steps_reached',
  STREAM_LIFETIME_EXCEEDED: 'stream_lifetime_exceeded',
} as const;

/** Activity Status Values */
export const ACTIVITY_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  PENDING: 'pending',
  WARNING: 'warning',
} as const;

/** Agent IDs */
export const AGENT_IDS = {
  USER: 'user',
  AI_ASSISTANT: 'ai-assistant',
} as const;

/** Activity Names */
export const ACTIVITY_NAMES = {
  CONTEXT_FETCH: 'Context Fetch',
  USER_MESSAGE: 'User Message',
  AI_ASSISTANT_MESSAGE: 'AI Assistant Message',
  AI_TEXT_GENERATION: 'AI Text Generation',
  AI_STREAMING_TEXT: 'AI Streaming Text',
  UNKNOWN_AGENT: 'Unknown Agent',
  USER: 'User',
} as const;

/** AI Tool Types */
export const AI_TOOL_TYPES = {
  MCP: 'mcp',
  TRANSFER: 'transfer',
  DELEGATION: 'delegation',
} as const;
