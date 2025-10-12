export type ModelSettings = {
  model: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

import type { AgentStopWhen } from '@inkeep/agents-core/client-exports';

export type AgentModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};

// Re-export the shared type for consistency
export type { AgentStopWhen };

export type StatusUpdateSettings = {
  enabled?: boolean;
  prompt?: string;
  numEvents?: number; // Trigger after N events (default: 10)
  timeInSeconds?: number; // Trigger after N seconds (default: 30)
  statusComponents?: string; // JSON string representation of status components array
};

export type AgentMetadata = {
  id?: string;
  name: string;
  description: string;
  contextConfig: ContextConfig;
  models?: AgentModels;
  stopWhen?: AgentStopWhen;
  agentPrompt?: string;
  statusUpdates?: StatusUpdateSettings;
};

export type ContextConfig = {
  id?: string;
  contextVariables: string; // JSON string
  headersSchema: string; // JSON string
};
