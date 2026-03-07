import type { SkillApiSelect } from '@inkeep/agents-core';

type ModelSettings = {
  model?: string;
  providerOptions?: string; // JSON string representation for form compatibility
};

export type AgentModels = {
  base?: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
};

export type AgentSkill = SkillApiSelect & { index: number; alwaysLoaded: boolean };
