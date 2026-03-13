type ModelSettings = {
  model: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

export type AgentModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};
