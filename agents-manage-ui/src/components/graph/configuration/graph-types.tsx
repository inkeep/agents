export type ModelSettings = {
  model: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

import type { GraphStopWhen } from '@inkeep/agents-core/client-exports';

export type GraphModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};

// Re-export the shared type for consistency
export type { GraphStopWhen };

export type StatusUpdateSettings = {
  enabled?: boolean;
  prompt?: string;
  numEvents?: number; // Trigger after N events (default: 10)
  timeInSeconds?: number; // Trigger after N seconds (default: 30)
  statusComponents?: string; // JSON string representation of status components array
};

export type GraphMetadata = {
  id?: string;
  name: string;
  description: string;
  contextConfig: ContextConfig;
  models?: GraphModels;
  stopWhen?: GraphStopWhen;
  graphPrompt?: string;
  statusUpdates?: StatusUpdateSettings;
};

export type ContextConfig = {
  id?: string;
  name: string;
  description: string;
  contextVariables: string; // JSON string
  requestContextSchema: string; // JSON string
};
