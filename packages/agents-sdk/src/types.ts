import type {
  AgentApiInsert,
  AgentConversationHistoryConfig,
  AgentStopWhen,
  ArtifactComponentApiInsert,
  CredentialReferenceApiInsert,
  DataComponentApiInsert,
  FullGraphDefinition,
  GraphStopWhen,
  McpTransportConfig,
  ModelSettings,
  StatusUpdateSettings,
  ToolInsert,
} from '@inkeep/agents-core';
import type { z } from 'zod';
import type { ArtifactComponentInterface } from './artifact-component';
import type { AgentMcpConfig } from './builders';
import type { DataComponentInterface } from './data-component';
import type { ExternalAgentConfig } from './externalAgent';
import type { FunctionTool } from './function-tool';
import type { Tool } from './tool';

// Re-export ModelSettings from agents-core for convenience
export type { ModelSettings };

/**
 * Tool instance that may have additional metadata attached during agent processing
 */
export type AgentTool =
  | (Tool & {
      selectedTools?: string[];
      headers?: Record<string, string>;
    })
  | (FunctionTool & {
      selectedTools?: string[];
      headers?: Record<string, string>;
    });

// Core message types following OpenAI pattern
export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolMessage {
  role: 'tool';
  content: string;
  toolCallId: string;
}

export interface SystemMessage {
  role: 'system';
  content: string;
}

export type Message = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

export type MessageInput = string | string[] | Message | Message[];

// Tool types
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  id: string;
  result: any;
  error?: string;
}
export type AllAgentInterface = AgentInterface | ExternalAgentInterface;

export type AgentCanUseType = Tool | AgentMcpConfig | FunctionTool;

// Agent configuration types
export interface AgentConfig extends Omit<AgentApiInsert, 'projectId'> {
  type?: 'internal'; // Discriminator for internal agents
  canUse?: () => AgentCanUseType[];
  canTransferTo?: () => AgentInterface[];
  canDelegateTo?: () => AllAgentInterface[];
  models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  stopWhen?: AgentStopWhen;
  memory?: {
    type: 'conversation' | 'episodic' | 'short_term';
    capacity?: number;
  };
  dataComponents?: () => (DataComponentApiInsert | DataComponentInterface)[];
  artifactComponents?: () => (ArtifactComponentApiInsert | ArtifactComponentInterface)[];
  conversationHistoryConfig?: AgentConversationHistoryConfig;
}

// Tool configuration types
export interface ToolConfig extends ToolInsert {
  execute: (params: any) => Promise<any>;
  parameters?: Record<string, any>;
  schema?: z.ZodJSONSchema;
}

// Registry-based server configuration
export interface ServerConfig {
  type: string;
  version?: string;
}

export interface MCPToolConfig {
  id: string;
  name: string;
  tenantId?: string;
  description?: string;
  credential?: CredentialReferenceApiInsert;
  server?: ServerConfig;
  serverUrl: string;
  toolName?: string;
  activeTools?: string[];
  headers?: Record<string, string>;
  mcpType?: 'nango' | 'generic';
  transport?: McpTransportConfig;
  imageUrl?: string; // Optional image URL for custom tool icon
}

export interface FetchDefinitionConfig {
  id: string;
  name?: string;
  trigger: 'initialization' | 'invocation';
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  transform?: string;
  responseSchema?: z.ZodSchema<any>;
  defaultValue?: unknown;
  timeout?: number;
  credential?: CredentialReferenceApiInsert;
}

// Function tool configuration
export interface FunctionToolConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  dependencies?: Record<string, string>; // npm package versions
  execute: ((params: any) => Promise<any>) | string; // Function or string to preserve formatting
}

// Sandbox configuration (project-level)
export interface SandboxConfig {
  provider: 'vercel' | 'daytona' | 'local';
  runtime: 'node22' | 'typescript';
  timeout?: number;
  vcpus?: number;
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

// Transfer types
export interface TransferConfig {
  agent: AgentInterface;
  description?: string;
  condition?: (context: any) => boolean;
}

// Generation options
export interface GenerateOptions {
  maxTurns?: number;
  maxSteps?: number;
  temperature?: number;
  toolChoice?: 'auto' | 'none' | string;
  resourceId?: string;
  conversationId?: string;
  stream?: boolean;
  customBodyParams?: Record<string, unknown>; // Request context for agent execution
}

// Response types
export interface AgentResponse {
  id?: string;
  text: string;
  toolCalls?: ToolCall[];
  transfer?: TransferConfig;
  finishReason: 'completed' | 'tool_calls' | 'transfer' | 'max_turns' | 'error';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  };
  metadata?: Record<string, any>;
}

export interface StreamResponse {
  textStream?: AsyncGenerator<string>;
  eventStream?: AsyncGenerator<StreamEvent>;
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'transfer' | 'error' | 'done';
  data: any;
  timestamp: Date;
}

// Run result types
export interface RunResult {
  finalOutput: string;
  agent: AgentInterface;
  turnCount: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  };
  metadata?: {
    toolCalls: ToolCall[];
    transfers: TransferConfig[];
  };
}

// Graph types
export interface GraphConfig {
  id: string;
  name?: string;
  description?: string;
  defaultAgent?: AgentInterface;
  agents?: () => AllAgentInterface[];
  contextConfig?: any; // ContextConfigBuilder - avoiding import for now
  credentials?: () => CredentialReferenceApiInsert[];
  stopWhen?: GraphStopWhen;
  graphPrompt?: string;
  models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  statusUpdates?: StatusUpdateSettings; // Configuration for LLM-powered status updates
}

// Error types
export class AgentError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class MaxTurnsExceededError extends AgentError {
  constructor(maxTurns: number) {
    super(`Maximum turns (${maxTurns}) exceeded`);
    this.code = 'MAX_TURNS_EXCEEDED';
  }
}

export class ToolExecutionError extends AgentError {
  constructor(toolName: string, originalError: Error) {
    super(`Tool '${toolName}' execution failed: ${originalError.message}`);
    this.code = 'TOOL_EXECUTION_ERROR';
    this.details = { toolName, originalError };
  }
}

export class TransferError extends AgentError {
  constructor(sourceAgent: string, targetAgent: string, reason: string) {
    super(`Transfer from '${sourceAgent}' to '${targetAgent}' failed: ${reason}`);
    this.code = 'TRANSFER_ERROR';
    this.details = { sourceAgent, targetAgent, reason };
  }
}

// Forward declaration for circular dependency
export interface AgentInterface {
  config: AgentConfig;
  type: 'internal';
  init(): Promise<void>;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getInstructions(): string;
  getTools(): Record<string, AgentTool>;
  getTransfers(): AgentInterface[];
  getDelegates(): AllAgentInterface[];
  getDataComponents(): DataComponentApiInsert[];
  getArtifactComponents(): ArtifactComponentApiInsert[];
  setContext(tenantId: string, projectId: string, baseURL?: string): void;
  addTool(name: string, tool: any): void;
  addTransfer(...agents: AgentInterface[]): void;
  addDelegate(...agents: AgentInterface[]): void;
}

export interface ExternalAgentInterface {
  config: ExternalAgentConfig;
  type: 'external';
  init(): Promise<void>;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getBaseUrl(): string;
  getCredentialReferenceId(): string | undefined;
  getHeaders(): Record<string, string> | undefined;
  setContext?(tenantId: string, baseURL?: string): void;
}

// Graph interface for runner operations
export interface GraphInterface {
  init(): Promise<void>;
  setConfig(tenantId: string, projectId: string, apiUrl: string): void;
  getId(): string;
  getName(): string;
  getDescription(): string | undefined;
  getTenantId(): string;
  generate(input: MessageInput, options?: GenerateOptions): Promise<string>;
  stream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse>;
  generateStream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse>;
  getDefaultAgent(): AgentInterface | undefined;
  getAgent(name: string): AllAgentInterface | undefined;
  getAgents(): AllAgentInterface[];
  toFullGraphDefinition(): Promise<FullGraphDefinition>;
}

// Legacy builder types (for backward compatibility)
export interface BuilderToolConfig {
  name: string;
  description: string;
  config: {
    type: 'mcp';
    mcp: {
      server: {
        url: string;
      };
    };
  };
  parameters?: Record<string, any>;
}

export interface BuilderRelationConfig {
  targetAgent: string;
  relationType: 'transfer' | 'delegate';
}

export interface BuilderAgentConfig {
  name: string;
  description: string;
  instructions: string;
  tools: BuilderToolConfig[];
  relations?: BuilderRelationConfig[];
}
