import type { z } from 'zod';
import type { ApiKeySelect } from '../index';
import type {
  McpTransportConfigSchema,
  ModelSchema,
  StatusComponentSchema,
  StatusUpdateSchema,
} from '../validation/schemas';

// Utility types
export type MessageVisibility = 'user-facing' | 'internal' | 'system' | 'external';
export type MessageType = 'chat' | 'a2a-request' | 'a2a-response' | 'task-update' | 'tool-call';
export type MessageRole = 'user' | 'agent' | 'system';
export type MessageMode = 'full' | 'scoped' | 'none';

export type Models = z.infer<typeof ModelSchema>;
export type ModelSettings = {
  model?: string;
  providerOptions?: Record<string, unknown>;
};

export type StatusUpdateSettings = z.infer<typeof StatusUpdateSchema>;
export type StatusComponent = z.infer<typeof StatusComponentSchema>;
export type PaginationConfig = {
  page?: number;
  limit?: number;
};

export type PaginationResult = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type ScopeConfig = {
  tenantId: string;
  projectId: string;
};

export interface ConversationScopeOptions {
  taskId?: string;
  agentId?: string;
}

export type ConversationHistoryConfig = {
  mode?: 'full' | 'scoped' | 'none';
  limit?: number;
  maxOutputTokens?: number;
  includeInternal?: boolean;
  messageTypes?: MessageType[];
};
// Interfaces for conversation management
export interface AgentConversationHistoryConfig extends ConversationHistoryConfig {
  mode: 'full' | 'scoped' | 'none';
}

export type ConversationMetadata = {
  userContext?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  sessionData?: Record<string, unknown>;
};

export type MessageContent = {
  // OpenAI Chat Completions format
  text?: string;
  // A2A format with parts array
  parts?: Array<{
    kind: string; // 'text', 'image', 'file', 'data', etc.
    text?: string;
    data?: string | Record<string, unknown>; // base64, reference, or structured data (e.g., artifact references)
    metadata?: Record<string, unknown>;
  }>;
  // Tool calls for function calling
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  // Tool call results
  tool_call_id?: string;
  name?: string;
};

export type MessageMetadata = {
  openai_model?: string;
  finish_reason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  a2a_metadata?: Record<string, unknown>;
  processing_time_ms?: number;
  error_details?: Record<string, unknown>;
};

// Context system type definitions
export type ContextFetchDefinition = {
  id: string;
  name?: string;
  trigger: 'initialization' | 'invocation';
  fetchConfig: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    transform?: string;
    timeout?: number;
  };
  responseSchema?: Record<string, unknown>; // JSON Schema for validating HTTP response
  defaultValue?: unknown;
  credentialReferenceId?: string; // Reference to credential store for secure credential resolution
};

export type ContextCacheEntry = {
  id: string;
  tenantId: string;
  projectId: string;
  conversationId: string;
  contextConfigId: string;
  contextVariableKey: string;
  value: unknown;
  requestHash?: string;
  fetchedAt: Date;
  fetchSource?: string;
  fetchDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type McpTranportType = 'streamable_http' | 'sse';
export type McpAuthType = 'bearer' | 'basic' | 'api_key' | 'none';

// Enhanced MCP Tool type definitions
export type McpServerAuth = {
  type: McpAuthType;
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  headerName?: string;
};

export type McpTransportConfig = z.infer<typeof McpTransportConfigSchema>;

export type McpServerCapabilities = {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type ToolMcpConfig = {
  // Server connection details
  server: {
    url: string;
    timeout?: number;
    headers?: Record<string, string>;
  };
  // Transport configuration
  transport?: McpTransportConfig;
  // Active tools to enable from this MCP server
  activeTools?: string[];
};

export type ToolServerCapabilities = {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
  streaming?: boolean;
};

export type TaskMetadataConfig = {
  conversation_id: string;
  message_id: string;
  created_at: string;
  updated_at: string;
  root_agent_id?: string;
  agent_id?: string;
  tool_id?: string;
  graph_id?: string;
  stream_request_id?: string;
};

export interface ProjectInfo {
  projectId: string;
}

export interface ProjectResourceCounts {
  agents: number;
  agentGraphs: number;
  tools: number;
  contextConfigs: number;
  externalAgents: number;
}

export interface RequestSchemaDefinition {
  body?: z.ZodSchema<any>;
  headers?: z.ZodSchema<any>;
  query?: z.ZodSchema<any>;
  params?: z.ZodSchema<any>;
}

export interface RequestSchemaConfig {
  schemas: RequestSchemaDefinition;
  optional?: ('body' | 'headers' | 'query' | 'params')[];
}

export type toolStatus = 'healthy' | 'unhealthy' | 'unknown';

export const TOOL_STATUS_VALUES = [
  'healthy',
  'unhealthy',
  'unknown',
  'disabled',
  'needs_auth',
] as const;

export const VALID_RELATION_TYPES = ['transfer', 'delegate'] as const;

export type McpToolStatus = (typeof TOOL_STATUS_VALUES)[number];

export interface CreateApiKeyParams {
  tenantId: string;
  projectId: string;
  graphId: string;
  expiresAt?: string;
}

export interface ApiKeyCreateResult {
  apiKey: ApiKeySelect;
  key: string; // The full API key (shown only once)
}

/**
 * Execution context that gets propagated through agent calls
 * Contains authentication and routing information for internal API calls
 */
export interface ExecutionContext {
  /** The original API key from the client request */
  apiKey: string;
  /** Tenant ID extracted from API key */
  tenantId: string;
  /** Project ID extracted from API key */
  projectId: string;
  /** Graph ID extracted from API key */
  graphId: string;
  /** Base URL for internal API calls */
  baseUrl: string;
  /** API key ID for tracking */
  apiKeyId: string;
  /** Agent ID extracted from request headers (only for internal A2A calls) */
  agentId?: string;
}
