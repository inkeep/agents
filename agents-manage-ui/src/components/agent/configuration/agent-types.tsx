type ModelSettings = {
  model: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

export type AgentModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};

export type ContextConfig = {
  id?: string;
  contextVariables: string; // JSON string
  headersSchema: string; // JSON string
};
