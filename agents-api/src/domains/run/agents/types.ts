import type {
  Artifact,
  ArtifactComponentApiInsert,
  BreakdownComponentDef,
  DataComponentApiInsert,
} from '@inkeep/agents-core';
import type { AssembleResult } from '../utils/token-estimator';

// Re-export for convenience
export type { BreakdownComponentDef };

// Base interfaces for version-agnostic system prompt building
export interface VersionConfig<TConfig> {
  loadTemplates(): Map<string, string>;
  assemble(templates: Map<string, string>, config: TConfig): AssembleResult;
  /** Returns the breakdown schema defining which components this version tracks */
  getBreakdownSchema(): BreakdownComponentDef[];
}

export interface SkillData {
  id: string;
  subAgentSkillId: string;
  name: string;
  description: string;
  content: string;
  metadata: Record<string, unknown> | null;
  index: number;
  alwaysLoaded: boolean;
}

export interface SystemPromptV1 {
  corePrompt: string; // Just the agent's prompt string
  prompt?: string; // Agent-level context and instructions
  skills?: SkillData[];
  artifacts: Artifact[];
  tools: ToolData[];
  mcpServerGroups?: McpServerGroupData[];
  dataComponents: DataComponentApiInsert[];
  artifactComponents?: ArtifactComponentApiInsert[];
  allProjectArtifactComponents?: ArtifactComponentApiInsert[]; // All artifact components across all agents in the project
  hasAgentArtifactComponents?: boolean; // Whether any agent in the agent has artifact components
  hasTransferRelations?: boolean; // Agent has transfer capabilities
  hasDelegateRelations?: boolean; // Agent has delegation capabilities
  includeDataComponents?: boolean; // Include data components in system prompt
  clientCurrentTime?: string; // Client's current time in their timezone
  includeSinglePhaseDataComponents?: boolean; // Include data components in single-phase mode
}

export interface ToolData {
  name: string;
  description?: string | null;
  inputSchema?: Record<string, unknown>; // JSON Schema format (MCP compatible)
  usageGuidelines?: string;
}

export interface McpServerGroupData {
  serverName: string;
  serverInstructions?: string;
  tools: ToolData[];
}
