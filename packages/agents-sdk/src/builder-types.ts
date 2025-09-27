/**
 * Type definitions for all builder functions in the agents-sdk
 * This file provides comprehensive type information for LLM generation and tooling
 */

// Re-export all configuration types that builder functions accept
export type {
  // Core builder function parameter types
  AgentConfig,
  GraphConfig,
  ModelSettings,

  // Tool configuration types
  ToolConfig,
  MCPToolConfig,

  // Component configuration types
  AgentTool,

  // Message and interaction types
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  SystemMessage,
  ToolCall,

  // Transfer and delegation types
  TransferConfig,

  // Generation and response types
  GenerateOptions,
  AgentResponse,
  RunResult,

  // Interface types
  AgentInterface,
  ExternalAgentInterface,
  GraphInterface,

  // Error types
  AgentError,
  MaxTurnsExceededError,
  ToolExecutionError,
  TransferError,
} from './types';

// Re-export builder-specific config types
export type {
  MCPServerConfig,
  DataComponentConfig,
  ArtifactComponentConfig,
  AgentMcpConfig,
  ToolExecuteFunction,
  TransferConditionFunction,
} from './builders';

// Re-export project types
export type { ProjectConfig } from './project';

// Re-export credential types
export type {
  CredentialReference,
  ExtractCredentialIds,
  UnionCredentialIds,
} from './credential-ref';

// Re-export external agent types
export type { ExternalAgentConfig } from './externalAgent';

// Re-export core types from agents-core that are used in builders
export type {
  CredentialReferenceApiInsert,
  ToolInsert,
  AgentApiInsert,
  AgentGraphApiInsert,
  McpTransportConfig,
  AgentStopWhen,
  GraphStopWhen,
} from '@inkeep/agents-core';

// Note: Builder function signatures are available through their respective modules
// This file focuses on re-exporting the configuration types needed for LLM generation

/**
 * Examples of builder function usage for LLM context
 * These provide the LLM with concrete examples of how to use each builder
 */
export const BUILDER_EXAMPLES = {
  agent: `const qaAgent = agent({
  id: 'qa-agent',
  name: 'QA Agent',
  prompt: 'You are a helpful QA agent...',
  canUse: () => [searchTool, factsTool],
  canTransferTo: () => [routerAgent],
  models: { base: { model: 'gpt-4o-mini' } }
});`,

  agentGraph: `const supportGraph = agentGraph({
  id: 'support-graph',
  name: 'Support Graph',
  description: 'Multi-agent support system',
  defaultAgent: routerAgent,
  agents: () => [routerAgent, qaAgent, supportAgent],
  models: { base: { model: 'gpt-4o' } }
});`,

  project: `const customerSupport = project({
  id: 'customer-support',
  name: 'Customer Support System',
  description: 'AI-powered customer support',
  graphs: () => [supportGraph, escalationGraph],
  models: { base: { model: 'gpt-4o-mini' } }
});`,

  mcpTool: `const searchTool = mcpTool({
  id: 'search-tool',
  name: 'Web Search',
  serverUrl: 'https://search-api.example.com/mcp',
  description: 'Search the web for information'
});`,

  mcpServer: `const weatherServer = mcpServer({
  name: 'weather-service',
  description: 'Weather information service',
  serverUrl: 'https://weather.example.com/mcp',
  activeTools: ['get_forecast', 'get_current']
});`,

  dataComponent: `const userProfile = dataComponent({
  name: 'User Profile',
  description: 'User profile information',
  props: {
    userId: 'string',
    email: 'string',
    preferences: 'object'
  }
});`,

  artifactComponent: `const orderSummary = artifactComponent({
  name: 'Order Summary',
  description: 'Customer order summary',
  summaryProps: { orderId: 'string', total: 'number' },
  fullProps: { orderId: 'string', items: 'array', total: 'number', tax: 'number' }
});`,

  credential: `const apiKey = credential({
  id: 'github-api-key',
  type: 'bearer',
  credentialStoreId: 'env-store'
});`,

  transfer: `const handoff = transfer(
  supportAgent,
  'Transfer to human support for complex issues',
  (context) => context.complexity > 0.8
);`
} as const;