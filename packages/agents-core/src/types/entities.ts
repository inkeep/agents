import type { z } from 'zod';
import type {
  SubAgentArtifactComponentApiInsertSchema,
  SubAgentArtifactComponentApiSelectSchema,
  SubAgentArtifactComponentApiUpdateSchema,
  SubAgentArtifactComponentInsertSchema,
  SubAgentArtifactComponentSelectSchema,
  SubAgentArtifactComponentUpdateSchema,
  SubAgentDataComponentApiInsertSchema,
  SubAgentDataComponentApiSelectSchema,
  SubAgentDataComponentApiUpdateSchema,
  SubAgentDataComponentInsertSchema,
  SubAgentDataComponentSelectSchema,
  SubAgentDataComponentUpdateSchema,
  AgentGraphApiInsertSchema,
  AgentGraphApiSelectSchema,
  AgentGraphApiUpdateSchema,
  AgentGraphInsertSchema,
  AgentGraphSelectSchema,
  AgentGraphUpdateSchema,
  SubAgentRelationApiInsertSchema,
  SubAgentRelationApiSelectSchema,
  SubAgentRelationApiUpdateSchema,
  SubAgentRelationInsertSchema,
  SubAgentRelationQuerySchema,
  SubAgentRelationSelectSchema,
  SubAgentRelationUpdateSchema,
  SubAgentToolRelationApiInsertSchema,
  SubAgentToolRelationApiSelectSchema,
  SubAgentToolRelationApiUpdateSchema,
  SubAgentToolRelationInsertSchema,
  SubAgentToolRelationSelectSchema,
  SubAgentToolRelationUpdateSchema,
  AllAgentSchema,
  ApiKeyApiCreationResponseSchema,
  ApiKeyApiInsertSchema,
  ApiKeyApiSelectSchema,
  ApiKeyApiUpdateSchema,
  ApiKeyInsertSchema,
  ApiKeySelectSchema,
  ApiKeyUpdateSchema,
  ArtifactComponentApiInsertSchema,
  ArtifactComponentApiSelectSchema,
  ArtifactComponentApiUpdateSchema,
  ArtifactComponentInsertSchema,
  ArtifactComponentSelectSchema,
  ArtifactComponentUpdateSchema,
  ContextCacheApiInsertSchema,
  ContextCacheApiSelectSchema,
  ContextCacheApiUpdateSchema,
  ContextCacheInsertSchema,
  ContextCacheSelectSchema,
  ContextCacheUpdateSchema,
  ContextConfigApiInsertSchema,
  ContextConfigApiSelectSchema,
  ContextConfigApiUpdateSchema,
  ContextConfigInsertSchema,
  ContextConfigSelectSchema,
  ContextConfigUpdateSchema,
  ConversationApiInsertSchema,
  ConversationApiSelectSchema,
  ConversationApiUpdateSchema,
  ConversationInsertSchema,
  ConversationSelectSchema,
  ConversationUpdateSchema,
  CredentialReferenceApiInsertSchema,
  CredentialReferenceApiSelectSchema,
  CredentialReferenceApiUpdateSchema,
  CredentialReferenceInsertSchema,
  CredentialReferenceSelectSchema,
  CredentialReferenceUpdateSchema,
  DataComponentApiInsertSchema,
  DataComponentApiSelectSchema,
  DataComponentApiUpdateSchema,
  DataComponentInsertSchema,
  DataComponentSelectSchema,
  DataComponentUpdateSchema,
  ExternalAgentApiInsertSchema,
  ExternalAgentApiSelectSchema,
  ExternalAgentApiUpdateSchema,
  ExternalAgentInsertSchema,
  ExternalSubAgentRelationApiInsertSchema,
  ExternalSubAgentRelationInsertSchema,
  ExternalAgentSelectSchema,
  ExternalAgentUpdateSchema,
  FetchConfigSchema,
  FetchDefinitionSchema,
  FullGraphAgentInsertSchema,
  FullProjectDefinitionSchema,
  FunctionApiInsertSchema,
  FunctionApiSelectSchema,
  FunctionApiUpdateSchema,
  FunctionInsertSchema,
  FunctionSelectSchema,
  FunctionToolApiInsertSchema,
  FunctionToolApiSelectSchema,
  FunctionToolApiUpdateSchema,
  FunctionUpdateSchema,
  GraphWithinContextOfProjectSchema,
  LedgerArtifactApiInsertSchema,
  LedgerArtifactApiSelectSchema,
  LedgerArtifactApiUpdateSchema,
  LedgerArtifactInsertSchema,
  LedgerArtifactSelectSchema,
  LedgerArtifactUpdateSchema,
  MCPToolConfigSchema,
  McpToolSchema,
  MessageApiInsertSchema,
  MessageApiSelectSchema,
  MessageApiUpdateSchema,
  MessageInsertSchema,
  MessageSelectSchema,
  MessageUpdateSchema,
  PaginationSchema,
  ProjectApiInsertSchema,
  ProjectApiSelectSchema,
  ProjectApiUpdateSchema,
  ProjectInsertSchema,
  ProjectSelectSchema,
  ProjectUpdateSchema,
  SubAgentApiInsertSchema,
  SubAgentApiSelectSchema,
  SubAgentApiUpdateSchema,
  SubAgentInsertSchema,
  SubAgentSelectSchema,
  SubAgentUpdateSchema,
  TaskApiInsertSchema,
  TaskApiSelectSchema,
  TaskApiUpdateSchema,
  TaskInsertSchema,
  TaskRelationApiInsertSchema,
  TaskRelationApiSelectSchema,
  TaskRelationApiUpdateSchema,
  TaskRelationInsertSchema,
  TaskRelationSelectSchema,
  TaskRelationUpdateSchema,
  TaskSelectSchema,
  TaskUpdateSchema,
  ToolApiInsertSchema,
  ToolApiSelectSchema,
  ToolApiUpdateSchema,
  ToolInsertSchema,
  ToolSelectSchema,
  ToolUpdateSchema,
} from '../validation/schemas';

// === Agent Types ===
export type SubAgentSelect = z.infer<typeof SubAgentSelectSchema>;
export type SubAgentInsert = z.infer<typeof SubAgentInsertSchema>;
export type SubAgentUpdate = z.infer<typeof SubAgentUpdateSchema>;
export type SubAgentApiSelect = z.infer<typeof SubAgentApiSelectSchema>;
export type SubAgentApiInsert = z.infer<typeof SubAgentApiInsertSchema>;
export type SubAgentApiUpdate = z.infer<typeof SubAgentApiUpdateSchema>;

// === SubAgent Relation Types ===
export type SubAgentRelationSelect = z.infer<typeof SubAgentRelationSelectSchema>;
export type SubAgentRelationInsert = z.infer<typeof SubAgentRelationInsertSchema>;
export type SubAgentRelationUpdate = z.infer<typeof SubAgentRelationUpdateSchema>;
export type SubAgentRelationApiSelect = z.infer<typeof SubAgentRelationApiSelectSchema>;
export type SubAgentRelationApiInsert = z.infer<typeof SubAgentRelationApiInsertSchema>;
export type SubAgentRelationApiUpdate = z.infer<typeof SubAgentRelationApiUpdateSchema>;
export type SubAgentRelationQuery = z.infer<typeof SubAgentRelationQuerySchema>;

// === External SubAgent Relation Types ===
export type ExternalSubAgentRelationInsert = z.infer<typeof ExternalSubAgentRelationInsertSchema>;
export type ExternalSubAgentRelationApiInsert = z.infer<typeof ExternalSubAgentRelationApiInsertSchema>;

// === Agent Graph Types ===
export type AgentGraphSelect = z.infer<typeof AgentGraphSelectSchema>;
export type AgentGraphInsert = z.infer<typeof AgentGraphInsertSchema>;
export type AgentGraphUpdate = z.infer<typeof AgentGraphUpdateSchema>;
export type AgentGraphApiSelect = z.infer<typeof AgentGraphApiSelectSchema>;
export type AgentGraphApiInsert = z.infer<typeof AgentGraphApiInsertSchema>;
export type AgentGraphApiUpdate = z.infer<typeof AgentGraphApiUpdateSchema>;

// === Task Types ===
export type TaskSelect = z.infer<typeof TaskSelectSchema>;
export type TaskInsert = z.infer<typeof TaskInsertSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;
export type TaskApiSelect = z.infer<typeof TaskApiSelectSchema>;
export type TaskApiInsert = z.infer<typeof TaskApiInsertSchema>;
export type TaskApiUpdate = z.infer<typeof TaskApiUpdateSchema>;

// === Task Relation Types ===
export type TaskRelationSelect = z.infer<typeof TaskRelationSelectSchema>;
export type TaskRelationInsert = z.infer<typeof TaskRelationInsertSchema>;
export type TaskRelationUpdate = z.infer<typeof TaskRelationUpdateSchema>;
export type TaskRelationApiSelect = z.infer<typeof TaskRelationApiSelectSchema>;
export type TaskRelationApiInsert = z.infer<typeof TaskRelationApiInsertSchema>;
export type TaskRelationApiUpdate = z.infer<typeof TaskRelationApiUpdateSchema>;

// === Tool Types ===
export type ToolSelect = z.infer<typeof ToolSelectSchema>;
export type ToolInsert = z.infer<typeof ToolInsertSchema>;
export type ToolUpdate = z.infer<typeof ToolUpdateSchema>;
export type ToolApiSelect = z.infer<typeof ToolApiSelectSchema>;
export type ToolApiInsert = z.infer<typeof ToolApiInsertSchema>;
export type ToolApiUpdate = z.infer<typeof ToolApiUpdateSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;
export type MCPToolConfig = z.infer<typeof MCPToolConfigSchema>;

// === Function Types ===
export type FunctionSelect = z.infer<typeof FunctionSelectSchema>;
export type FunctionInsert = z.infer<typeof FunctionInsertSchema>;
export type FunctionUpdate = z.infer<typeof FunctionUpdateSchema>;
export type FunctionApiSelect = z.infer<typeof FunctionApiSelectSchema>;
export type FunctionApiInsert = z.infer<typeof FunctionApiInsertSchema>;
export type FunctionApiUpdate = z.infer<typeof FunctionApiUpdateSchema>;

export type FunctionToolApiSelect = z.infer<typeof FunctionToolApiSelectSchema>;
export type FunctionToolApiInsert = z.infer<typeof FunctionToolApiInsertSchema>;
export type FunctionToolApiUpdate = z.infer<typeof FunctionToolApiUpdateSchema>;

// === Conversation Types ===
export type ConversationSelect = z.infer<typeof ConversationSelectSchema>;
export type ConversationInsert = z.infer<typeof ConversationInsertSchema>;
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;
export type ConversationApiSelect = z.infer<typeof ConversationApiSelectSchema>;
export type ConversationApiInsert = z.infer<typeof ConversationApiInsertSchema>;
export type ConversationApiUpdate = z.infer<typeof ConversationApiUpdateSchema>;

// === Message Types ===
export type MessageSelect = z.infer<typeof MessageSelectSchema>;
export type MessageInsert = z.infer<typeof MessageInsertSchema>;
export type MessageUpdate = z.infer<typeof MessageUpdateSchema>;
export type MessageApiSelect = z.infer<typeof MessageApiSelectSchema>;
export type MessageApiInsert = z.infer<typeof MessageApiInsertSchema>;
export type MessageApiUpdate = z.infer<typeof MessageApiUpdateSchema>;

// === Context Config Types ===
export type ContextConfigSelect = z.infer<typeof ContextConfigSelectSchema>;
export type ContextConfigInsert = z.infer<typeof ContextConfigInsertSchema>;
export type ContextConfigUpdate = z.infer<typeof ContextConfigUpdateSchema>;
export type ContextConfigApiSelect = z.infer<typeof ContextConfigApiSelectSchema>;
export type ContextConfigApiInsert = z.infer<typeof ContextConfigApiInsertSchema>;
export type ContextConfigApiUpdate = z.infer<typeof ContextConfigApiUpdateSchema>;
export type FetchDefinition = z.infer<typeof FetchDefinitionSchema>;
export type FetchConfig = z.infer<typeof FetchConfigSchema>;

// === Context Cache Types ===
export type ContextCacheSelect = z.infer<typeof ContextCacheSelectSchema>;
export type ContextCacheInsert = z.infer<typeof ContextCacheInsertSchema>;
export type ContextCacheUpdate = z.infer<typeof ContextCacheUpdateSchema>;
export type ContextCacheApiSelect = z.infer<typeof ContextCacheApiSelectSchema>;
export type ContextCacheApiInsert = z.infer<typeof ContextCacheApiInsertSchema>;
export type ContextCacheApiUpdate = z.infer<typeof ContextCacheApiUpdateSchema>;

// === Data Component Types ===
export type DataComponentSelect = z.infer<typeof DataComponentSelectSchema>;
export type DataComponentInsert = z.infer<typeof DataComponentInsertSchema>;
export type DataComponentUpdate = z.infer<typeof DataComponentUpdateSchema>;
export type DataComponentApiSelect = z.infer<typeof DataComponentApiSelectSchema>;
export type DataComponentApiInsert = z.infer<typeof DataComponentApiInsertSchema>;
export type DataComponentApiUpdate = z.infer<typeof DataComponentApiUpdateSchema>;

// === SubAgent Data Component Types ===

export type SubAgentDataComponentSelect = z.infer<typeof SubAgentDataComponentSelectSchema>;
export type SubAgentDataComponentInsert = z.infer<typeof SubAgentDataComponentInsertSchema>;
export type SubAgentDataComponentUpdate = z.infer<typeof SubAgentDataComponentUpdateSchema>;
export type SubAgentDataComponentApiSelect = z.infer<typeof SubAgentDataComponentApiSelectSchema>;
export type SubAgentDataComponentApiInsert = z.infer<typeof SubAgentDataComponentApiInsertSchema>;
export type SubAgentDataComponentApiUpdate = z.infer<typeof SubAgentDataComponentApiUpdateSchema>;

// === Artifact Component Types ===
export type ArtifactComponentSelect = z.infer<typeof ArtifactComponentSelectSchema>;
export type ArtifactComponentInsert = z.infer<typeof ArtifactComponentInsertSchema>;
export type ArtifactComponentUpdate = z.infer<typeof ArtifactComponentUpdateSchema>;
export type ArtifactComponentApiSelect = z.infer<typeof ArtifactComponentApiSelectSchema>;
export type ArtifactComponentApiInsert = z.infer<typeof ArtifactComponentApiInsertSchema>;
export type ArtifactComponentApiUpdate = z.infer<typeof ArtifactComponentApiUpdateSchema>;

// === SubAgent Artifact Component Types ===
export type SubAgentArtifactComponentSelect = z.infer<typeof SubAgentArtifactComponentSelectSchema>;
export type SubAgentArtifactComponentInsert = z.infer<typeof SubAgentArtifactComponentInsertSchema>;
export type SubAgentArtifactComponentUpdate = z.infer<typeof SubAgentArtifactComponentUpdateSchema>;
export type SubAgentArtifactComponentApiSelect = z.infer<typeof SubAgentArtifactComponentApiSelectSchema>;
export type SubAgentArtifactComponentApiInsert = z.infer<typeof SubAgentArtifactComponentApiInsertSchema>;
export type SubAgentArtifactComponentApiUpdate = z.infer<typeof SubAgentArtifactComponentApiUpdateSchema>;

// === External Agent Types ===
export type ExternalAgentSelect = z.infer<typeof ExternalAgentSelectSchema>;
export type ExternalAgentInsert = z.infer<typeof ExternalAgentInsertSchema>;
export type ExternalAgentUpdate = z.infer<typeof ExternalAgentUpdateSchema>;
export type ExternalAgentApiSelect = z.infer<typeof ExternalAgentApiSelectSchema>;
export type ExternalAgentApiInsert = z.infer<typeof ExternalAgentApiInsertSchema>;
export type ExternalAgentApiUpdate = z.infer<typeof ExternalAgentApiUpdateSchema>;
export type AllAgentSelect = z.infer<typeof AllAgentSchema>;

// === API Key Types ===
export type ApiKeySelect = z.infer<typeof ApiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof ApiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof ApiKeyUpdateSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiInsert = z.infer<typeof ApiKeyApiInsertSchema>;
export type ApiKeyApiUpdate = z.infer<typeof ApiKeyApiUpdateSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;

// === Credential Reference Types ===
export type CredentialReferenceSelect = z.infer<typeof CredentialReferenceSelectSchema>;
export type CredentialReferenceInsert = z.infer<typeof CredentialReferenceInsertSchema>;
export type CredentialReferenceUpdate = z.infer<typeof CredentialReferenceUpdateSchema>;
export type CredentialReferenceApiSelect = z.infer<typeof CredentialReferenceApiSelectSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type CredentialReferenceApiUpdate = z.infer<typeof CredentialReferenceApiUpdateSchema>;

// === SubAgent Tool Relation Types ===
export type SubAgentToolRelationSelect = z.infer<typeof SubAgentToolRelationSelectSchema>;
export type SubAgentToolRelationInsert = z.infer<typeof SubAgentToolRelationInsertSchema>;
export type SubAgentToolRelationUpdate = z.infer<typeof SubAgentToolRelationUpdateSchema>;
export type SubAgentToolRelationApiSelect = z.infer<typeof SubAgentToolRelationApiSelectSchema>;
export type SubAgentToolRelationApiInsert = z.infer<typeof SubAgentToolRelationApiInsertSchema>;
export type SubAgentToolRelationApiUpdate = z.infer<typeof SubAgentToolRelationApiUpdateSchema>;

// === Ledger Artifact Types ===
export type LedgerArtifactSelect = z.infer<typeof LedgerArtifactSelectSchema>;
export type LedgerArtifactInsert = z.infer<typeof LedgerArtifactInsertSchema>;
export type LedgerArtifactUpdate = z.infer<typeof LedgerArtifactUpdateSchema>;
export type LedgerArtifactApiSelect = z.infer<typeof LedgerArtifactApiSelectSchema>;
export type LedgerArtifactApiInsert = z.infer<typeof LedgerArtifactApiInsertSchema>;
export type LedgerArtifactApiUpdate = z.infer<typeof LedgerArtifactApiUpdateSchema>;

// === Full Graph Types ===
export type FullGraphDefinition = z.infer<typeof GraphWithinContextOfProjectSchema>;
export type FullGraphAgentInsert = z.infer<typeof FullGraphAgentInsertSchema>;

// === Full Project Types ===
export type FullProjectDefinition = z.infer<typeof FullProjectDefinitionSchema>;
// Type helpers for better TypeScript support
export type CanUseItem = {
  toolId: string;
  toolSelection?: string[] | null;
  headers?: Record<string, string> | null;
  agentToolRelationId?: string;
};

export type InternalAgentDefinition = z.infer<typeof SubAgentApiInsertSchema> & {
  canUse: CanUseItem[];
  dataComponents?: string[];
  artifactComponents?: string[];
  canTransferTo?: string[];
  canDelegateTo?: string[];
};

export type AgentDefinition = InternalAgentDefinition | ExternalAgentApiInsert;
export type ToolDefinition = ToolApiInsert & { credentialReferenceId?: string | null };

// === Project Types ===
export type ProjectSelect = z.infer<typeof ProjectSelectSchema>;
export type ProjectInsert = z.infer<typeof ProjectInsertSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
export type ProjectApiSelect = z.infer<typeof ProjectApiSelectSchema>;
export type ProjectApiInsert = z.infer<typeof ProjectApiInsertSchema>;
export type ProjectApiUpdate = z.infer<typeof ProjectApiUpdateSchema>;

// === Pagination Types ===
export type Pagination = z.infer<typeof PaginationSchema>;

// === Summary Event Types ===
export interface SummaryEvent {
  type: string; // Summary type to distinguish different summary categories (e.g., 'progress', 'status', 'completion')
  label: string; // LLM-generated label for the UI (use sentence case)
  details?: {
    [key: string]: any; // Structured data from graph session
  };
}
