import type {
  Artifact,
  ArtifactComponentApiInsert,
  DataComponentApiInsert,
} from '@inkeep/agents-core';

// Base interfaces for version-agnostic system prompt building
export interface VersionConfig<TConfig> {
  loadTemplates(): Map<string, string>;
  assemble(templates: Map<string, string>, config: TConfig): string;
}

export interface SystemPromptV1 {
  corePrompt: string; // Just the agent's prompt string
  graphPrompt?: string; // Graph-level context and instructions
  artifacts: Artifact[];
  tools: ToolData[]; // Support both formats
  dataComponents: DataComponentApiInsert[];
  artifactComponents?: ArtifactComponentApiInsert[];
  hasGraphArtifactComponents?: boolean; // Whether any agent in the graph has artifact components
  isThinkingPreparation?: boolean; // Flag for thinking/preparation mode (first pass of 2-phase generation)
  hasTransferRelations?: boolean; // Agent has transfer capabilities
  hasDelegateRelations?: boolean; // Agent has delegation capabilities
}

export interface ToolData {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>; // JSON Schema format (MCP compatible)
  usageGuidelines?: string;
}
