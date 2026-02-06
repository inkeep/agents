type ModelSettings = {
  model: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

import type { AgentStopWhen } from '@inkeep/agents-core/client-exports';

export type AgentModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};

export type AgentMetadata = {
  models?: AgentModels;
  stopWhen?: AgentStopWhen;
};

export type ContextConfig = {
  id?: string;
  contextVariables: string; // JSON string
  headersSchema: string; // JSON string
};
