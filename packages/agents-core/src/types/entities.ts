import type { z } from 'zod';
import type {
  AgentApiInsertSchema,
  AgentApiSelectSchema,
  AgentApiUpdateSchema,
  AgentArtifactComponentApiInsertSchema,
  AgentArtifactComponentApiSelectSchema,
  AgentArtifactComponentApiUpdateSchema,
  AgentArtifactComponentInsertSchema,
  AgentArtifactComponentSelectSchema,
  AgentArtifactComponentUpdateSchema,
  AgentDataComponentApiInsertSchema,
  AgentDataComponentApiSelectSchema,
  AgentDataComponentApiUpdateSchema,
  AgentDataComponentInsertSchema,
  AgentDataComponentSelectSchema,
  AgentDataComponentUpdateSchema,
  AgentGraphApiInsertSchema,
  AgentGraphApiSelectSchema,
  AgentGraphApiUpdateSchema,
  AgentGraphInsertSchema,
  AgentGraphSelectSchema,
  AgentGraphUpdateSchema,
  AgentInsertSchema,
  AgentRelationApiInsertSchema,
  AgentRelationApiSelectSchema,
  AgentRelationApiUpdateSchema,
  AgentRelationInsertSchema,
  AgentRelationQuerySchema,
  AgentRelationSelectSchema,
  AgentRelationUpdateSchema,
  AgentSelectSchema,
  AgentToolRelationApiInsertSchema,
  AgentToolRelationApiSelectSchema,
  AgentToolRelationApiUpdateSchema,
  AgentToolRelationInsertSchema,
  AgentToolRelationSelectSchema,
  AgentToolRelationUpdateSchema,
  AgentUpdateSchema,
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
  ExternalAgentRelationApiInsertSchema,
  ExternalAgentRelationInsertSchema,
  ExternalAgentSelectSchema,
  ExternalAgentUpdateSchema,
  FetchConfigSchema,
  FetchDefinitionSchema,
  FullGraphAgentInsertSchema,
  FullGraphDefinitionSchema,
  LedgerArtifactApiInsertSchema,
  LedgerArtifactApiSelectSchema,
  LedgerArtifactApiUpdateSchema,
  LedgerArtifactInsertSchema,
  LedgerArtifactSelectSchema,
  LedgerArtifactUpdateSchema,
  MCPToolConfigSchema,
  McpToolSchema,
  McpToolServerConfigSchema,
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
} from '../validation/schemas.js';

// === Agent Types ===
export type AgentSelect = z.infer<typeof AgentSelectSchema>;
export type AgentInsert = z.infer<typeof AgentInsertSchema>;
export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;
export type AgentApiSelect = z.infer<typeof AgentApiSelectSchema>;
export type AgentApiInsert = z.infer<typeof AgentApiInsertSchema>;
export type AgentApiUpdate = z.infer<typeof AgentApiUpdateSchema>;

// === Agent Relation Types ===
export type AgentRelationSelect = z.infer<typeof AgentRelationSelectSchema>;
export type AgentRelationInsert = z.infer<typeof AgentRelationInsertSchema>;
export type AgentRelationUpdate = z.infer<typeof AgentRelationUpdateSchema>;
export type AgentRelationApiSelect = z.infer<typeof AgentRelationApiSelectSchema>;
export type AgentRelationApiInsert = z.infer<typeof AgentRelationApiInsertSchema>;
export type AgentRelationApiUpdate = z.infer<typeof AgentRelationApiUpdateSchema>;
export type AgentRelationQuery = z.infer<typeof AgentRelationQuerySchema>;

// === External Agent Relation Types ===
export type ExternalAgentRelationInsert = z.infer<typeof ExternalAgentRelationInsertSchema>;
export type ExternalAgentRelationApiInsert = z.infer<typeof ExternalAgentRelationApiInsertSchema>;

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
export type McpToolServerConfig = z.infer<typeof McpToolServerConfigSchema>;

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

// === Agent Data Component Types ===

export type AgentDataComponentSelect = z.infer<typeof AgentDataComponentSelectSchema>;
export type AgentDataComponentInsert = z.infer<typeof AgentDataComponentInsertSchema>;
export type AgentDataComponentUpdate = z.infer<typeof AgentDataComponentUpdateSchema>;
export type AgentDataComponentApiSelect = z.infer<typeof AgentDataComponentApiSelectSchema>;
export type AgentDataComponentApiInsert = z.infer<typeof AgentDataComponentApiInsertSchema>;
export type AgentDataComponentApiUpdate = z.infer<typeof AgentDataComponentApiUpdateSchema>;

// === Artifact Component Types ===
export type ArtifactComponentSelect = z.infer<typeof ArtifactComponentSelectSchema>;
export type ArtifactComponentInsert = z.infer<typeof ArtifactComponentInsertSchema>;
export type ArtifactComponentUpdate = z.infer<typeof ArtifactComponentUpdateSchema>;
export type ArtifactComponentApiSelect = z.infer<typeof ArtifactComponentApiSelectSchema>;
export type ArtifactComponentApiInsert = z.infer<typeof ArtifactComponentApiInsertSchema>;
export type ArtifactComponentApiUpdate = z.infer<typeof ArtifactComponentApiUpdateSchema>;

// === Agent Artifact Component Types ===
export type AgentArtifactComponentSelect = z.infer<typeof AgentArtifactComponentSelectSchema>;
export type AgentArtifactComponentInsert = z.infer<typeof AgentArtifactComponentInsertSchema>;
export type AgentArtifactComponentUpdate = z.infer<typeof AgentArtifactComponentUpdateSchema>;
export type AgentArtifactComponentApiSelect = z.infer<typeof AgentArtifactComponentApiSelectSchema>;
export type AgentArtifactComponentApiInsert = z.infer<typeof AgentArtifactComponentApiInsertSchema>;
export type AgentArtifactComponentApiUpdate = z.infer<typeof AgentArtifactComponentApiUpdateSchema>;

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

// === Agent Tool Relation Types ===
export type AgentToolRelationSelect = z.infer<typeof AgentToolRelationSelectSchema>;
export type AgentToolRelationInsert = z.infer<typeof AgentToolRelationInsertSchema>;
export type AgentToolRelationUpdate = z.infer<typeof AgentToolRelationUpdateSchema>;
export type AgentToolRelationApiSelect = z.infer<typeof AgentToolRelationApiSelectSchema>;
export type AgentToolRelationApiInsert = z.infer<typeof AgentToolRelationApiInsertSchema>;
export type AgentToolRelationApiUpdate = z.infer<typeof AgentToolRelationApiUpdateSchema>;

// === Ledger Artifact Types ===
export type LedgerArtifactSelect = z.infer<typeof LedgerArtifactSelectSchema>;
export type LedgerArtifactInsert = z.infer<typeof LedgerArtifactInsertSchema>;
export type LedgerArtifactUpdate = z.infer<typeof LedgerArtifactUpdateSchema>;
export type LedgerArtifactApiSelect = z.infer<typeof LedgerArtifactApiSelectSchema>;
export type LedgerArtifactApiInsert = z.infer<typeof LedgerArtifactApiInsertSchema>;
export type LedgerArtifactApiUpdate = z.infer<typeof LedgerArtifactApiUpdateSchema>;

// === Full Graph Types ===
export type FullGraphDefinition = z.infer<typeof FullGraphDefinitionSchema>;
export type FullGraphAgentInsert = z.infer<typeof FullGraphAgentInsertSchema>;
// Type helpers for better TypeScript support
export type InternalAgentDefinition = z.infer<typeof AgentApiInsertSchema> & {
  tools: string[];
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
