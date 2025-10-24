import type { z } from 'zod';
import type {
  AgentApiInsertSchema,
  AgentApiSelectSchema,
  AgentApiUpdateSchema,
  AgentInsertSchema,
  AgentSelectSchema,
  AgentUpdateSchema,
  AgentWithinContextOfProjectSchema,
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
  CanUseItemSchema,
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
  canDelegateToExternalAgentSchema,
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
  ExternalAgentSelectSchema,
  ExternalAgentUpdateSchema,
  ExternalSubAgentRelationApiInsertSchema,
  ExternalSubAgentRelationInsertSchema,
  FetchConfigSchema,
  FetchDefinitionSchema,
  FullAgentAgentInsertSchema,
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
  SubAgentExternalAgentRelationApiInsertSchema,
  SubAgentExternalAgentRelationApiSelectSchema,
  SubAgentExternalAgentRelationApiUpdateSchema,
  SubAgentExternalAgentRelationInsertSchema,
  SubAgentExternalAgentRelationSelectSchema,
  SubAgentExternalAgentRelationUpdateSchema,
  SubAgentInsertSchema,
  SubAgentRelationApiInsertSchema,
  SubAgentRelationApiSelectSchema,
  SubAgentRelationApiUpdateSchema,
  SubAgentRelationInsertSchema,
  SubAgentRelationQuerySchema,
  SubAgentRelationSelectSchema,
  SubAgentRelationUpdateSchema,
  SubAgentSelectSchema,
  SubAgentTeamAgentRelationApiInsertSchema,
  SubAgentTeamAgentRelationApiSelectSchema,
  SubAgentTeamAgentRelationApiUpdateSchema,
  SubAgentTeamAgentRelationInsertSchema,
  SubAgentTeamAgentRelationSelectSchema,
  SubAgentTeamAgentRelationUpdateSchema,
  SubAgentToolRelationApiInsertSchema,
  SubAgentToolRelationApiSelectSchema,
  SubAgentToolRelationApiUpdateSchema,
  SubAgentToolRelationInsertSchema,
  SubAgentToolRelationSelectSchema,
  SubAgentToolRelationUpdateSchema,
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

export type SubAgentSelect = z.infer<typeof SubAgentSelectSchema>;
export type SubAgentInsert = z.infer<typeof SubAgentInsertSchema>;
export type SubAgentUpdate = z.infer<typeof SubAgentUpdateSchema>;
export type SubAgentApiSelect = z.infer<typeof SubAgentApiSelectSchema>;
export type SubAgentApiInsert = z.infer<typeof SubAgentApiInsertSchema>;
export type SubAgentApiUpdate = z.infer<typeof SubAgentApiUpdateSchema>;

export type SubAgentRelationSelect = z.infer<typeof SubAgentRelationSelectSchema>;
export type SubAgentRelationInsert = z.infer<typeof SubAgentRelationInsertSchema>;
export type SubAgentRelationUpdate = z.infer<typeof SubAgentRelationUpdateSchema>;
export type SubAgentRelationApiSelect = z.infer<typeof SubAgentRelationApiSelectSchema>;
export type SubAgentRelationApiInsert = z.infer<typeof SubAgentRelationApiInsertSchema>;
export type SubAgentRelationApiUpdate = z.infer<typeof SubAgentRelationApiUpdateSchema>;
export type SubAgentRelationQuery = z.infer<typeof SubAgentRelationQuerySchema>;

export type ExternalSubAgentRelationInsert = z.infer<typeof ExternalSubAgentRelationInsertSchema>;
export type ExternalSubAgentRelationApiInsert = z.infer<
  typeof ExternalSubAgentRelationApiInsertSchema
>;

export type AgentSelect = z.infer<typeof AgentSelectSchema>;
export type AgentInsert = z.infer<typeof AgentInsertSchema>;
export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;
export type AgentApiSelect = z.infer<typeof AgentApiSelectSchema>;
export type AgentApiInsert = z.infer<typeof AgentApiInsertSchema>;
export type AgentApiUpdate = z.infer<typeof AgentApiUpdateSchema>;

export type TaskSelect = z.infer<typeof TaskSelectSchema>;
export type TaskInsert = z.infer<typeof TaskInsertSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;
export type TaskApiSelect = z.infer<typeof TaskApiSelectSchema>;
export type TaskApiInsert = z.infer<typeof TaskApiInsertSchema>;
export type TaskApiUpdate = z.infer<typeof TaskApiUpdateSchema>;

export type TaskRelationSelect = z.infer<typeof TaskRelationSelectSchema>;
export type TaskRelationInsert = z.infer<typeof TaskRelationInsertSchema>;
export type TaskRelationUpdate = z.infer<typeof TaskRelationUpdateSchema>;
export type TaskRelationApiSelect = z.infer<typeof TaskRelationApiSelectSchema>;
export type TaskRelationApiInsert = z.infer<typeof TaskRelationApiInsertSchema>;
export type TaskRelationApiUpdate = z.infer<typeof TaskRelationApiUpdateSchema>;

export type ToolSelect = z.infer<typeof ToolSelectSchema>;
export type ToolInsert = z.infer<typeof ToolInsertSchema>;
export type ToolUpdate = z.infer<typeof ToolUpdateSchema>;
export type ToolApiSelect = z.infer<typeof ToolApiSelectSchema>;
export type ToolApiInsert = z.infer<typeof ToolApiInsertSchema>;
export type ToolApiUpdate = z.infer<typeof ToolApiUpdateSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;
export type MCPToolConfig = z.infer<typeof MCPToolConfigSchema>;

export type FunctionSelect = z.infer<typeof FunctionSelectSchema>;
export type FunctionInsert = z.infer<typeof FunctionInsertSchema>;
export type FunctionUpdate = z.infer<typeof FunctionUpdateSchema>;
export type FunctionApiSelect = z.infer<typeof FunctionApiSelectSchema>;
export type FunctionApiInsert = z.infer<typeof FunctionApiInsertSchema>;
export type FunctionApiUpdate = z.infer<typeof FunctionApiUpdateSchema>;

export type FunctionToolApiSelect = z.infer<typeof FunctionToolApiSelectSchema>;
export type FunctionToolApiInsert = z.infer<typeof FunctionToolApiInsertSchema>;
export type FunctionToolApiUpdate = z.infer<typeof FunctionToolApiUpdateSchema>;

export type ConversationSelect = z.infer<typeof ConversationSelectSchema>;
export type ConversationInsert = z.infer<typeof ConversationInsertSchema>;
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;
export type ConversationApiSelect = z.infer<typeof ConversationApiSelectSchema>;
export type ConversationApiInsert = z.infer<typeof ConversationApiInsertSchema>;
export type ConversationApiUpdate = z.infer<typeof ConversationApiUpdateSchema>;

export type MessageSelect = z.infer<typeof MessageSelectSchema>;
export type MessageInsert = z.infer<typeof MessageInsertSchema>;
export type MessageUpdate = z.infer<typeof MessageUpdateSchema>;
export type MessageApiSelect = z.infer<typeof MessageApiSelectSchema>;
export type MessageApiInsert = z.infer<typeof MessageApiInsertSchema>;
export type MessageApiUpdate = z.infer<typeof MessageApiUpdateSchema>;

export type ContextConfigSelect = z.infer<typeof ContextConfigSelectSchema>;
export type ContextConfigInsert = z.infer<typeof ContextConfigInsertSchema>;
export type ContextConfigUpdate = z.infer<typeof ContextConfigUpdateSchema>;
export type ContextConfigApiSelect = z.infer<typeof ContextConfigApiSelectSchema>;
export type ContextConfigApiInsert = z.infer<typeof ContextConfigApiInsertSchema>;
export type ContextConfigApiUpdate = z.infer<typeof ContextConfigApiUpdateSchema>;
export type FetchDefinition = z.infer<typeof FetchDefinitionSchema>;
export type FetchConfig = z.infer<typeof FetchConfigSchema>;

export type ContextCacheSelect = z.infer<typeof ContextCacheSelectSchema>;
export type ContextCacheInsert = z.infer<typeof ContextCacheInsertSchema>;
export type ContextCacheUpdate = z.infer<typeof ContextCacheUpdateSchema>;
export type ContextCacheApiSelect = z.infer<typeof ContextCacheApiSelectSchema>;
export type ContextCacheApiInsert = z.infer<typeof ContextCacheApiInsertSchema>;
export type ContextCacheApiUpdate = z.infer<typeof ContextCacheApiUpdateSchema>;

export type DataComponentSelect = z.infer<typeof DataComponentSelectSchema>;
export type DataComponentInsert = z.infer<typeof DataComponentInsertSchema>;
export type DataComponentUpdate = z.infer<typeof DataComponentUpdateSchema>;
export type DataComponentApiSelect = z.infer<typeof DataComponentApiSelectSchema>;
export type DataComponentApiInsert = z.infer<typeof DataComponentApiInsertSchema>;
export type DataComponentApiUpdate = z.infer<typeof DataComponentApiUpdateSchema>;

export type SubAgentDataComponentSelect = z.infer<typeof SubAgentDataComponentSelectSchema>;
export type SubAgentDataComponentInsert = z.infer<typeof SubAgentDataComponentInsertSchema>;
export type SubAgentDataComponentUpdate = z.infer<typeof SubAgentDataComponentUpdateSchema>;
export type SubAgentDataComponentApiSelect = z.infer<typeof SubAgentDataComponentApiSelectSchema>;
export type SubAgentDataComponentApiInsert = z.infer<typeof SubAgentDataComponentApiInsertSchema>;
export type SubAgentDataComponentApiUpdate = z.infer<typeof SubAgentDataComponentApiUpdateSchema>;

export type ArtifactComponentSelect = z.infer<typeof ArtifactComponentSelectSchema>;
export type ArtifactComponentInsert = z.infer<typeof ArtifactComponentInsertSchema>;
export type ArtifactComponentUpdate = z.infer<typeof ArtifactComponentUpdateSchema>;
export type ArtifactComponentApiSelect = z.infer<typeof ArtifactComponentApiSelectSchema>;
export type ArtifactComponentApiInsert = z.infer<typeof ArtifactComponentApiInsertSchema>;
export type ArtifactComponentApiUpdate = z.infer<typeof ArtifactComponentApiUpdateSchema>;

export type SubAgentArtifactComponentSelect = z.infer<typeof SubAgentArtifactComponentSelectSchema>;
export type SubAgentArtifactComponentInsert = z.infer<typeof SubAgentArtifactComponentInsertSchema>;
export type SubAgentArtifactComponentUpdate = z.infer<typeof SubAgentArtifactComponentUpdateSchema>;
export type SubAgentArtifactComponentApiSelect = z.infer<
  typeof SubAgentArtifactComponentApiSelectSchema
>;
export type SubAgentArtifactComponentApiInsert = z.infer<
  typeof SubAgentArtifactComponentApiInsertSchema
>;
export type SubAgentArtifactComponentApiUpdate = z.infer<
  typeof SubAgentArtifactComponentApiUpdateSchema
>;

export type ExternalAgentSelect = z.infer<typeof ExternalAgentSelectSchema>;
export type ExternalAgentInsert = z.infer<typeof ExternalAgentInsertSchema>;
export type ExternalAgentUpdate = z.infer<typeof ExternalAgentUpdateSchema>;
export type ExternalAgentApiSelect = z.infer<typeof ExternalAgentApiSelectSchema>;
export type ExternalAgentApiInsert = z.infer<typeof ExternalAgentApiInsertSchema>;
export type ExternalAgentApiUpdate = z.infer<typeof ExternalAgentApiUpdateSchema>;

export type AllAgentSelect = z.infer<typeof AllAgentSchema>;

export type ApiKeySelect = z.infer<typeof ApiKeySelectSchema>;
export type ApiKeyInsert = z.infer<typeof ApiKeyInsertSchema>;
export type ApiKeyUpdate = z.infer<typeof ApiKeyUpdateSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiInsert = z.infer<typeof ApiKeyApiInsertSchema>;
export type ApiKeyApiUpdate = z.infer<typeof ApiKeyApiUpdateSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;

export type CredentialReferenceSelect = z.infer<typeof CredentialReferenceSelectSchema>;
export type CredentialReferenceInsert = z.infer<typeof CredentialReferenceInsertSchema>;
export type CredentialReferenceUpdate = z.infer<typeof CredentialReferenceUpdateSchema>;
export type CredentialReferenceApiSelect = z.infer<typeof CredentialReferenceApiSelectSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type CredentialReferenceApiUpdate = z.infer<typeof CredentialReferenceApiUpdateSchema>;

export type SubAgentToolRelationSelect = z.infer<typeof SubAgentToolRelationSelectSchema>;
export type SubAgentToolRelationInsert = z.infer<typeof SubAgentToolRelationInsertSchema>;
export type SubAgentToolRelationUpdate = z.infer<typeof SubAgentToolRelationUpdateSchema>;
export type SubAgentToolRelationApiSelect = z.infer<typeof SubAgentToolRelationApiSelectSchema>;
export type SubAgentToolRelationApiInsert = z.infer<typeof SubAgentToolRelationApiInsertSchema>;
export type SubAgentToolRelationApiUpdate = z.infer<typeof SubAgentToolRelationApiUpdateSchema>;

export type SubAgentExternalAgentRelationSelect = z.infer<
  typeof SubAgentExternalAgentRelationSelectSchema
>;
export type SubAgentExternalAgentRelationInsert = z.infer<
  typeof SubAgentExternalAgentRelationInsertSchema
>;
export type SubAgentExternalAgentRelationUpdate = z.infer<
  typeof SubAgentExternalAgentRelationUpdateSchema
>;
export type SubAgentExternalAgentRelationApiSelect = z.infer<
  typeof SubAgentExternalAgentRelationApiSelectSchema
>;
export type SubAgentExternalAgentRelationApiInsert = z.infer<
  typeof SubAgentExternalAgentRelationApiInsertSchema
>;
export type SubAgentExternalAgentRelationApiUpdate = z.infer<
  typeof SubAgentExternalAgentRelationApiUpdateSchema
>;

export type SubAgentTeamAgentRelationSelect = z.infer<typeof SubAgentTeamAgentRelationSelectSchema>;
export type SubAgentTeamAgentRelationInsert = z.infer<typeof SubAgentTeamAgentRelationInsertSchema>;
export type SubAgentTeamAgentRelationUpdate = z.infer<typeof SubAgentTeamAgentRelationUpdateSchema>;
export type SubAgentTeamAgentRelationApiSelect = z.infer<
  typeof SubAgentTeamAgentRelationApiSelectSchema
>;
export type SubAgentTeamAgentRelationApiInsert = z.infer<
  typeof SubAgentTeamAgentRelationApiInsertSchema
>;
export type SubAgentTeamAgentRelationApiUpdate = z.infer<
  typeof SubAgentTeamAgentRelationApiUpdateSchema
>;

export type LedgerArtifactSelect = z.infer<typeof LedgerArtifactSelectSchema>;
export type LedgerArtifactInsert = z.infer<typeof LedgerArtifactInsertSchema>;
export type LedgerArtifactUpdate = z.infer<typeof LedgerArtifactUpdateSchema>;
export type LedgerArtifactApiSelect = z.infer<typeof LedgerArtifactApiSelectSchema>;
export type LedgerArtifactApiInsert = z.infer<typeof LedgerArtifactApiInsertSchema>;
export type LedgerArtifactApiUpdate = z.infer<typeof LedgerArtifactApiUpdateSchema>;

export type FullAgentDefinition = z.infer<typeof AgentWithinContextOfProjectSchema>;
export type FullAgentAgentInsert = z.infer<typeof FullAgentAgentInsertSchema>;

export type FullProjectDefinition = z.infer<typeof FullProjectDefinitionSchema>;
export type CanUseItem = z.infer<typeof CanUseItemSchema>;
export type CanDelegateToExternalAgent = z.infer<typeof canDelegateToExternalAgentSchema>;

export type SubAgentDefinition = z.infer<typeof SubAgentApiInsertSchema> & {
  canUse: CanUseItem[];
  dataComponents?: string[];
  artifactComponents?: string[];
  canTransferTo?: string[];
  canDelegateTo?: (string | CanDelegateToExternalAgent)[]; // Internal subAgent ID or external agent with headers
};
export type ToolDefinition = ToolApiInsert & { credentialReferenceId?: string | null };

export type ProjectSelect = z.infer<typeof ProjectSelectSchema>;
export type ProjectInsert = z.infer<typeof ProjectInsertSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
export type ProjectApiSelect = z.infer<typeof ProjectApiSelectSchema>;
export type ProjectApiInsert = z.infer<typeof ProjectApiInsertSchema>;
export type ProjectApiUpdate = z.infer<typeof ProjectApiUpdateSchema>;

export type Pagination = z.infer<typeof PaginationSchema>;

export interface SummaryEvent {
  type: string; // Summary type to distinguish different summary categories (e.g., 'progress', 'status', 'completion')
  label: string; // LLM-generated label for the UI (use sentence case)
  details?: {
    [key: string]: any; // Structured data from agent session
  };
}
