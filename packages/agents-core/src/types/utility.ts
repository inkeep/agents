import type { z } from '@hono/zod-openapi';
import type { ApiKeySelect, FullProjectSelectWithRelationIds, ResolvedRef } from '../index';
import type {
  EvaluationJobFilterCriteriaSchema,
  McpTransportConfigSchema,
  ModelSchema,
  ProjectModelSchema,
  StatusComponentSchema,
  StatusUpdateSchema,
  WorkAppGitHubAccountTypeSchema,
  WorkAppGitHubInstallationStatusSchema,
} from '../validation/schemas';

// Utility types
export type MessageVisibility = 'user-facing' | 'internal' | 'system' | 'external';
export type MessageType =
  | 'chat'
  | 'a2a-request'
  | 'a2a-response'
  | 'task-update'
  | 'tool-call'
  | 'tool-result';
export type MessageRole = 'user' | 'agent' | 'system';
export type MessageMode = 'full' | 'scoped' | 'none';

export type Models = z.infer<typeof ModelSchema>;
export type ProjectModels = z.infer<typeof ProjectModelSchema>;
// Note: ModelSettings is exported directly from validation/schemas.ts (no need to re-export here)

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

// Scope config types are derived from SCOPE_KEYS in scope-definitions.ts.
// Re-exported here to keep existing import paths working.
export type {
  AgentScopeConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../db/manage/scope-definitions';
export interface ConversationScopeOptions {
  taskId?: string;
  subAgentId?: string;
  delegationId?: string;
  isDelegated?: boolean;
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
  apiKeyId?: string;
  initiatedBy?: {
    type: 'user' | 'api_key';
    id: string;
  };
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
    requiredToFetch?: Array<string>; // Context variables that are required to run the fetch request. If the given variables cannot be resolved, the fetch request will be skipped.
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

export type ToolSimplifyConfig = {
  displayName?: string;
  description?: string;
  schema?: any; // Zod schema or JSON schema
  transformation?: Record<string, string> | string; // object mapping or JMESPath expression
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
  // Tool overrides for individual tool schema/display customization
  toolOverrides?: Record<string, ToolSimplifyConfig>;
  // Custom prompt / instructions sent to the LLM about this MCP server
  prompt?: string;
};

export type ToolServerCapabilities = {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
  streaming?: boolean;
  // Default instructions from the MCP server's initialize response
  serverInstructions?: string;
};

export type TaskMetadataConfig = {
  conversation_id: string;
  message_id: string;
  created_at: string;
  updated_at: string;
  root_sub_agent_id?: string;
  sub_agent_id?: string;
  tool_id?: string;
  agent_id?: string;
  stream_request_id?: string;
};

export interface ProjectInfo {
  projectId: string;
}

export interface ProjectResourceCounts {
  subAgents: number;
  agents: number;
  tools: number;
  contextConfigs: number;
  externalAgents: number;
}

export const TOOL_STATUS_VALUES = [
  'healthy',
  'unhealthy',
  'unknown',
  'needs_auth',
  'unavailable',
] as const;

export const VALID_RELATION_TYPES = ['transfer', 'delegate'] as const;

export const MCPTransportType = {
  streamableHttp: 'streamable_http',
  sse: 'sse',
} as const;

export const MCPServerType = {
  nango: 'nango',
  generic: 'generic',
} as const;

export const CredentialStoreType = {
  memory: 'memory',
  keychain: 'keychain',
  nango: 'nango',
} as const;

export interface CreateApiKeyParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  name: string;
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
export interface BaseExecutionContext {
  /** The original API key from the client request */
  apiKey: string;
  /** Tenant ID extracted from API key */
  tenantId: string;
  /** Project ID extracted from API key */
  projectId: string;
  /** Agent ID extracted from API key */
  agentId: string;
  /** Base URL for internal API calls */
  baseUrl: string;
  /** API key ID for tracking */
  apiKeyId: string;
  /** Ref extracted from query params */
  ref?: string;
  /** Sub Agent ID extracted from request headers (only for internal A2A calls) */
  subAgentId?: string;
  /** Metadata for the execution context */
  metadata?: {
    teamDelegation?: boolean;
    originAgentId?: string;
    initiatedBy?: {
      type: 'user' | 'api_key';
      id: string;
    };
    slack?: {
      authorized: true;
      authSource: 'channel' | 'workspace';
      channelId?: string;
      teamId: string;
    };
  };
}

export interface FullExecutionContext extends BaseExecutionContext {
  resolvedRef: ResolvedRef;
  project: FullProjectSelectWithRelationIds;
}

/**
 * Reusable filter type that supports and/or operations
 *
 * Allows composition of filters using:
 * - Direct filter criteria (e.g., { agentIds: ['id1', 'id2'] })
 * - AND operation: { and: [filter1, filter2, ...] }
 * - OR operation: { or: [filter1, filter2, ...] }
 *
 * @template T - The base filter criteria type (e.g., { agentIds?: string[] })
 *
 * @example
 * // Simple filter
 * const filter: Filter<{ agentIds?: string[] }> = { agentIds: ['id1'] };
 *
 * @example
 * // AND operation
 * const filter: Filter<{ agentIds?: string[] }> = {
 *   and: [
 *     { agentIds: ['id1'] },
 *     { agentIds: ['id2'] }
 *   ]
 * };
 *
 * @example
 * // OR operation
 * const filter: Filter<{ agentIds?: string[] }> = {
 *   or: [
 *     { agentIds: ['id1'] },
 *     { agentIds: ['id2'] }
 *   ]
 * };
 *
 * @example
 * // Complex nested operations
 * const filter: Filter<{ agentIds?: string[] }> = {
 *   and: [
 *     { agentIds: ['id1'] },
 *     {
 *       or: [
 *         { agentIds: ['id2'] },
 *         { agentIds: ['id3'] }
 *       ]
 *     }
 *   ]
 * };
 */
export type Filter<T extends Record<string, unknown>> =
  | T
  | { and: Array<Filter<T>> }
  | { or: Array<Filter<T>> };

export type PassCriteriaOperator = '>' | '<' | '>=' | '<=' | '=' | '!=';

export type PassCriteriaCondition = {
  field: string;
  operator: PassCriteriaOperator;
  value: number;
};

export type PassCriteria = {
  operator: 'and' | 'or';
  conditions: PassCriteriaCondition[];
};

export type EvaluationJobFilterCriteria = z.infer<typeof EvaluationJobFilterCriteriaSchema>;

export type EvaluationSuiteFilterCriteria = {
  agentIds?: string[];
  [key: string]: unknown;
};

export type DatasetItemInput = {
  messages: Array<{ role: string; content: MessageContent }>;
  headers?: Record<string, string>;
};

export type DatasetItemExpectedOutput = Array<{ role: string; content: MessageContent }>;

/**
 * GitHub App installation status.
 * - 'pending': Installation request awaiting org admin approval
 * - 'active': Installation is active and functional
 * - 'suspended': Installation suspended by GitHub or org admin
 * - 'disconnected': Installation has been disconnected by the user (soft delete)
 */
export type WorkAppGitHubInstallationStatus = z.infer<typeof WorkAppGitHubInstallationStatusSchema>;

/**
 * GitHub account type for the installation target.
 * - 'Organization': Installed on a GitHub organization
 * - 'User': Installed on a personal GitHub account
 */
export type WorkAppGitHubAccountType = z.infer<typeof WorkAppGitHubAccountTypeSchema>;
