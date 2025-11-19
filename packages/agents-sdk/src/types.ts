import type {
  AgentConversationHistoryConfig,
  AgentStopWhen,
  ArtifactComponentApiInsert,
  CredentialReferenceApiInsert,
  DataComponentApiInsert,
  FullAgentDefinition,
  McpTransportConfig,
  ModelSettings,
  StatusUpdateSettings,
  SubAgentApiInsert,
  ToolInsert,
  ToolPolicy,
} from '@inkeep/agents-core';
import type { z } from 'zod';
import type { ArtifactComponentInterface } from './artifact-component';
import type { AgentMcpConfig as SubAgentMcpConfig } from './builders';
import type { DataComponentInterface } from './data-component';
import type { ExternalAgentConfig } from './external-agent';
import type { FunctionTool } from './function-tool';
import type { Tool } from './tool';

export interface ArtifactComponentWithZodProps {
  id: string;
  name: string;
  description: string;
  props?: z.ZodObject<any>;
}

export interface DataComponentWithZodProps {
  id: string;
  name: string;
  description: string;
  props?: z.ZodObject<any>;
}
export type { ModelSettings };

/**
 * Tool instance that may have additional metadata attached during agent processing
 */
export type AgentTool =
  | (Tool & {
      selectedTools?: string[];
      headers?: Record<string, string>;
      toolPolicies?: Record<string, ToolPolicy>;
    })
  | (FunctionTool & {
      selectedTools?: string[];
      headers?: Record<string, string>;
      toolPolicies?: Record<string, ToolPolicy>;
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
export type AllDelegateInputInterface =
  | SubAgentInterface
  | subAgentExternalAgentInterface
  | ExternalAgentInterface
  | AgentInterface
  | subAgentTeamAgentInterface;

export type AllDelegateOutputInterface =
  | SubAgentInterface
  | subAgentExternalAgentInterface
  | subAgentTeamAgentInterface;

export type SubAgentCanUseType = Tool | SubAgentMcpConfig | FunctionTool;

export interface SubAgentConfig extends Omit<SubAgentApiInsert, 'projectId'> {
  type?: 'internal'; // Discriminator for internal agents
  canUse?: () => SubAgentCanUseType[];
  canTransferTo?: () => SubAgentInterface[];
  canDelegateTo?: () => AllDelegateInputInterface[];
  dataComponents?: () => (
    | DataComponentApiInsert
    | DataComponentInterface
    | DataComponentWithZodProps
  )[];
  artifactComponents?: () => (
    | ArtifactComponentApiInsert
    | ArtifactComponentInterface
    | ArtifactComponentWithZodProps
  )[];
  conversationHistoryConfig?: AgentConversationHistoryConfig;
}

export interface ToolConfig extends ToolInsert {
  execute: (params: any) => Promise<any>;
  parameters?: Record<string, any>;
  schema?: z.ZodJSONSchema;
}

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

export type { FunctionToolConfig } from '@inkeep/agents-core';

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

export interface TransferConfig {
  agent: SubAgentInterface;
  description?: string;
  condition?: (context: any) => boolean;
}

export interface GenerateOptions {
  maxTurns?: number;
  maxSteps?: number;
  temperature?: number;
  toolChoice?: 'auto' | 'none' | string;
  resourceId?: string;
  conversationId?: string;
  stream?: boolean;
  customBodyParams?: Record<string, unknown>;
}

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

export interface RunResult {
  finalOutput: string;
  agent: SubAgentInterface;
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

export interface AgentConfig {
  id: string;
  name?: string;
  description?: string;
  defaultSubAgent: SubAgentInterface;
  subAgents?: () => SubAgentInterface[];
  contextConfig?: any;
  credentials?: () => CredentialReferenceApiInsert[];
  stopWhen?: AgentStopWhen;
  prompt?: string;
  models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  statusUpdates?: StatusUpdateSettings;
}

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

export interface SubAgentInterface {
  config: SubAgentConfig;
  type: 'internal';
  init(): Promise<void>;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getInstructions(): string;
  getTools(): Record<string, AgentTool>;
  getTransfers(): SubAgentInterface[];
  getDelegates(): AllDelegateOutputInterface[];
  getSubAgentDelegates(): SubAgentInterface[];
  getExternalAgentDelegates(): subAgentExternalAgentInterface[];
  getDataComponents(): DataComponentApiInsert[];
  getArtifactComponents(): ArtifactComponentApiInsert[];
  setContext(tenantId: string, projectId: string, baseURL?: string): void;
  addTool(name: string, tool: any): void;
  addTransfer(...agents: SubAgentInterface[]): void;
  addDelegate(...agents: AllDelegateInputInterface[]): void;
}

export interface ExternalAgentInterface {
  config: ExternalAgentConfig;
  type: 'external';
  init(): Promise<void>;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getBaseUrl(): string;
  setContext?(tenantId: string, projectId: string): void;
  with(options: { headers?: Record<string, string> }): subAgentExternalAgentInterface;
  getCredentialReferenceId(): string | undefined;
  getCredentialReference(): CredentialReferenceApiInsert | undefined;
}

export type subAgentExternalAgentInterface = {
  externalAgent: ExternalAgentInterface;
  headers?: Record<string, string>;
};

export type subAgentTeamAgentInterface = {
  agent: AgentInterface;
  headers?: Record<string, string>;
};

export interface AgentInterface {
  init(): Promise<void>;
  setConfig(tenantId: string, projectId: string, apiUrl: string): void;
  getId(): string;
  getName(): string;
  getDescription(): string | undefined;
  getTenantId(): string;
  generate(input: MessageInput, options?: GenerateOptions): Promise<string>;
  stream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse>;
  generateStream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse>;
  getDefaultSubAgent(): SubAgentInterface | undefined;
  getSubAgent(name: string): SubAgentInterface | undefined;
  getSubAgents(): SubAgentInterface[];
  toFullAgentDefinition(): Promise<FullAgentDefinition>;
  with(options: { headers?: Record<string, string> }): subAgentTeamAgentInterface;
}

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
