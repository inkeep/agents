import { z } from '@hono/zod-openapi';
import type { StreamableHTTPReconnectionOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  agentArtifactComponents,
  agentDataComponents,
  agentGraph,
  agentRelations,
  agents,
  agentToolRelations,
  apiKeys,
  artifactComponents,
  contextCache,
  contextConfigs,
  conversations,
  credentialReferences,
  dataComponents,
  externalAgents,
  ledgerArtifacts,
  messages,
  projects,
  taskRelations,
  tasks,
  tools,
} from '../db/schema';
import {
  CredentialStoreType,
  MCPServerType,
  MCPTransportType,
  TOOL_STATUS_VALUES,
  VALID_RELATION_TYPES,
} from '../types/utility';

// === Reusable StopWhen Schemas ===
// Full stopWhen schema with both transfer and step count limits
export const StopWhenSchema = z.object({
  transferCountIs: z.number().min(1).max(100).optional(),
  stepCountIs: z.number().min(1).max(1000).optional(),
});

// Subset for graph level (only transfer count)
export const GraphStopWhenSchema = StopWhenSchema.pick({ transferCountIs: true });

// Subset for agent level (only step count)
export const AgentStopWhenSchema = StopWhenSchema.pick({ stepCountIs: true });

// Type inference for use in database schema and elsewhere
export type StopWhen = z.infer<typeof StopWhenSchema>;
export type GraphStopWhen = z.infer<typeof GraphStopWhenSchema>;
export type AgentStopWhen = z.infer<typeof AgentStopWhenSchema>;

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

// Resource ID validation schema
export const resourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  })
  .openapi({
    description: 'Resource identifier',
    example: 'resource_789',
  });

export const ModelSettingsSchema = z.object({
  model: z.string().optional(),
  providerOptions: z.record(z.string(), z.any()).optional(),
});

export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export const ModelSchema = z.object({
  base: ModelSettingsSchema.optional(),
  structuredOutput: ModelSettingsSchema.optional(),
  summarizer: ModelSettingsSchema.optional(),
});

export const ProjectModelSchema = z.object({
  base: ModelSettingsSchema,
  structuredOutput: ModelSettingsSchema.optional(),
  summarizer: ModelSettingsSchema.optional(),
});

// Helper functions with better type preservation
const createApiSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }) satisfies z.ZodObject<any>;

const createApiInsertSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }) satisfies z.ZodObject<any>;

const createApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }).partial() satisfies z.ZodObject<any>;

// Specific helper for graph-scoped entities that also need graphId omitted
const createGraphScopedApiSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true, graphId: true }) satisfies z.ZodObject<any>;

const createGraphScopedApiInsertSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true, graphId: true }) satisfies z.ZodObject<any>;

const createGraphScopedApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema
    .omit({ tenantId: true, projectId: true, graphId: true })
    .partial() satisfies z.ZodObject<any>;

// === Agent Schemas ===
export const AgentSelectSchema = createSelectSchema(agents);

export const AgentInsertSchema = createInsertSchema(agents).extend({
  id: resourceIdSchema,
  models: ModelSchema.optional(),
});

export const AgentUpdateSchema = AgentInsertSchema.partial();

export const AgentApiSelectSchema = createGraphScopedApiSchema(AgentSelectSchema);
export const AgentApiInsertSchema = createGraphScopedApiInsertSchema(AgentInsertSchema);
export const AgentApiUpdateSchema = createGraphScopedApiUpdateSchema(AgentUpdateSchema);

// === Agent Relations Schemas ===
export const AgentRelationSelectSchema = createSelectSchema(agentRelations);
export const AgentRelationInsertSchema = createInsertSchema(agentRelations).extend({
  id: resourceIdSchema,
  graphId: resourceIdSchema,
  sourceAgentId: resourceIdSchema,
  targetAgentId: resourceIdSchema.optional(),
  externalAgentId: resourceIdSchema.optional(),
});
export const AgentRelationUpdateSchema = AgentRelationInsertSchema.partial();

export const AgentRelationApiSelectSchema = createGraphScopedApiSchema(AgentRelationSelectSchema);
export const AgentRelationApiInsertSchema = createGraphScopedApiInsertSchema(
  AgentRelationInsertSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES),
  })
  .refine(
    (data) => {
      // Exactly one of targetAgentId or externalAgentId must be provided
      const hasTarget = data.targetAgentId != null;
      const hasExternal = data.externalAgentId != null;
      return hasTarget !== hasExternal; // XOR - exactly one must be true
    },
    {
      message: 'Must specify exactly one of targetAgentId or externalAgentId',
      path: ['targetAgentId', 'externalAgentId'],
    }
  );

export const AgentRelationApiUpdateSchema = createGraphScopedApiUpdateSchema(
  AgentRelationUpdateSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES).optional(),
  })
  .refine(
    (data) => {
      // Only validate agent IDs if either is provided in the update
      const hasTarget = data.targetAgentId != null;
      const hasExternal = data.externalAgentId != null;

      // If neither is provided (updating only other fields), skip validation
      if (!hasTarget && !hasExternal) {
        return true;
      }

      // If either is provided, exactly one of targetAgentId or externalAgentId must be provided
      return hasTarget !== hasExternal; // XOR - exactly one must be true
    },
    {
      message:
        'Must specify exactly one of targetAgentId or externalAgentId when updating agent relationships',
      path: ['targetAgentId', 'externalAgentId'],
    }
  );

export const AgentRelationQuerySchema = z.object({
  sourceAgentId: z.string().optional(),
  targetAgentId: z.string().optional(),
  externalAgentId: z.string().optional(),
});

// === External Agent Relations Schemas ===
export const ExternalAgentRelationInsertSchema = createInsertSchema(agentRelations).extend({
  id: resourceIdSchema,
  graphId: resourceIdSchema,
  sourceAgentId: resourceIdSchema,
  externalAgentId: resourceIdSchema,
});

export const ExternalAgentRelationApiInsertSchema = createApiInsertSchema(
  ExternalAgentRelationInsertSchema
);

// === Agent Graph Schemas ===
export const AgentGraphSelectSchema = createSelectSchema(agentGraph);
export const AgentGraphInsertSchema = createInsertSchema(agentGraph).extend({
  id: resourceIdSchema,
});
export const AgentGraphUpdateSchema = AgentGraphInsertSchema.partial();

export const AgentGraphApiSelectSchema = createApiSchema(AgentGraphSelectSchema);
export const AgentGraphApiInsertSchema = createApiInsertSchema(AgentGraphInsertSchema).extend({
  id: resourceIdSchema,
});
export const AgentGraphApiUpdateSchema = createApiUpdateSchema(AgentGraphUpdateSchema);

// === Task Schemas ===
export const TaskSelectSchema = createSelectSchema(tasks);
export const TaskInsertSchema = createInsertSchema(tasks).extend({
  id: resourceIdSchema,
  conversationId: resourceIdSchema.optional(),
});
export const TaskUpdateSchema = TaskInsertSchema.partial();

export const TaskApiSelectSchema = createApiSchema(TaskSelectSchema);
export const TaskApiInsertSchema = createApiInsertSchema(TaskInsertSchema);
export const TaskApiUpdateSchema = createApiUpdateSchema(TaskUpdateSchema);

// === Task Relations Schemas ===
export const TaskRelationSelectSchema = createSelectSchema(taskRelations);
export const TaskRelationInsertSchema = createInsertSchema(taskRelations).extend({
  id: resourceIdSchema,
  parentTaskId: resourceIdSchema,
  childTaskId: resourceIdSchema,
});
export const TaskRelationUpdateSchema = TaskRelationInsertSchema.partial();

export const TaskRelationApiSelectSchema = createApiSchema(TaskRelationSelectSchema);
export const TaskRelationApiInsertSchema = createApiInsertSchema(TaskRelationInsertSchema);
export const TaskRelationApiUpdateSchema = createApiUpdateSchema(TaskRelationUpdateSchema);

// === Tool Schemas ===
// Custom image URL validation
const imageUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url) return true; // Optional field
      // Allow data URLs (base64 encoded images)
      if (url.startsWith('data:image/')) {
        // Check for valid base64 format and reasonable size (1MB limit)
        const base64Part = url.split(',')[1];
        if (!base64Part) return false;
        // Rough estimate: base64 increases size by ~33%, so 1MB = ~1.33MB base64
        return base64Part.length < 1400000; // ~1MB limit
      }
      // Allow regular HTTP(S) URLs
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    {
      message: 'Image URL must be a valid HTTP(S) URL or a base64 data URL (max 1MB)',
    }
  );

// Enhanced validation schemas for MCP tools
export const McpTransportConfigSchema = z.object({
  type: z.enum(MCPTransportType),
  requestInit: z.record(z.string(), z.unknown()).optional(),
  eventSourceInit: z.record(z.string(), z.unknown()).optional(),
  reconnectionOptions: z.custom<StreamableHTTPReconnectionOptions>().optional(),
  sessionId: z.string().optional(),
});

export const ToolStatusSchema = z.enum(TOOL_STATUS_VALUES);

export const McpToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const ToolSelectSchema = createSelectSchema(tools);

export const ToolInsertSchema = createInsertSchema(tools).extend({
  id: resourceIdSchema,
  imageUrl: imageUrlSchema,
});

// === Conversation Schemas ===
export const ConversationSelectSchema = createSelectSchema(conversations);
export const ConversationInsertSchema = createInsertSchema(conversations).extend({
  id: resourceIdSchema,
  contextConfigId: resourceIdSchema.optional(),
});
export const ConversationUpdateSchema = ConversationInsertSchema.partial();

export const ConversationApiSelectSchema = createApiSchema(ConversationSelectSchema);
export const ConversationApiInsertSchema = createApiInsertSchema(ConversationInsertSchema);
export const ConversationApiUpdateSchema = createApiUpdateSchema(ConversationUpdateSchema);

// === Message Schemas ===
export const MessageSelectSchema = createSelectSchema(messages);
export const MessageInsertSchema = createInsertSchema(messages).extend({
  id: resourceIdSchema,
  conversationId: resourceIdSchema,
  taskId: resourceIdSchema.optional(),
});
export const MessageUpdateSchema = MessageInsertSchema.partial();

export const MessageApiSelectSchema = createApiSchema(MessageSelectSchema);
export const MessageApiInsertSchema = createApiInsertSchema(MessageInsertSchema);
export const MessageApiUpdateSchema = createApiUpdateSchema(MessageUpdateSchema);

// === Context Cache Schemas ===
export const ContextCacheSelectSchema = createSelectSchema(contextCache);
export const ContextCacheInsertSchema = createInsertSchema(contextCache);
export const ContextCacheUpdateSchema = ContextCacheInsertSchema.partial();

export const ContextCacheApiSelectSchema = createApiSchema(ContextCacheSelectSchema);
export const ContextCacheApiInsertSchema = createApiInsertSchema(ContextCacheInsertSchema);
export const ContextCacheApiUpdateSchema = createApiUpdateSchema(ContextCacheUpdateSchema);

// === Data Component Schemas ===
export const DataComponentSelectSchema = createSelectSchema(dataComponents);
export const DataComponentInsertSchema = createInsertSchema(dataComponents).extend({
  id: resourceIdSchema,
});
export const DataComponentBaseSchema = DataComponentInsertSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const DataComponentUpdateSchema = DataComponentInsertSchema.partial();

export const DataComponentApiSelectSchema = createApiSchema(DataComponentSelectSchema);
export const DataComponentApiInsertSchema = createApiInsertSchema(DataComponentInsertSchema);
export const DataComponentApiUpdateSchema = createApiUpdateSchema(DataComponentUpdateSchema);

// === Agent Data Component Schemas ===

export const AgentDataComponentSelectSchema = createSelectSchema(agentDataComponents);
export const AgentDataComponentInsertSchema = createInsertSchema(agentDataComponents);
export const AgentDataComponentUpdateSchema = AgentDataComponentInsertSchema.partial();

export const AgentDataComponentApiSelectSchema = createGraphScopedApiSchema(
  AgentDataComponentSelectSchema
);
export const AgentDataComponentApiInsertSchema = AgentDataComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const AgentDataComponentApiUpdateSchema = createGraphScopedApiUpdateSchema(
  AgentDataComponentUpdateSchema
);

// === Artifact Component Schemas ===
export const ArtifactComponentSelectSchema = createSelectSchema(artifactComponents);
export const ArtifactComponentInsertSchema = createInsertSchema(artifactComponents).extend({
  id: resourceIdSchema,
});
export const ArtifactComponentUpdateSchema = ArtifactComponentInsertSchema.partial();

export const ArtifactComponentApiSelectSchema = createApiSchema(ArtifactComponentSelectSchema);
export const ArtifactComponentApiInsertSchema = ArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
});
export const ArtifactComponentApiUpdateSchema = createApiUpdateSchema(
  ArtifactComponentUpdateSchema
);

// === Agent Artifact Component Schemas ===

export const AgentArtifactComponentSelectSchema = createSelectSchema(agentArtifactComponents);
export const AgentArtifactComponentInsertSchema = createInsertSchema(
  agentArtifactComponents
).extend({
  id: resourceIdSchema,
  agentId: resourceIdSchema,
  artifactComponentId: resourceIdSchema,
});
export const AgentArtifactComponentUpdateSchema = AgentArtifactComponentInsertSchema.partial();

export const AgentArtifactComponentApiSelectSchema = createGraphScopedApiSchema(
  AgentArtifactComponentSelectSchema
);
export const AgentArtifactComponentApiInsertSchema = AgentArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const AgentArtifactComponentApiUpdateSchema = createGraphScopedApiUpdateSchema(
  AgentArtifactComponentUpdateSchema
);

// === External Agent Schemas ===
export const ExternalAgentSelectSchema = createSelectSchema(externalAgents).extend({
  credentialReferenceId: z.string().nullable().optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
});
export const ExternalAgentInsertSchema = createInsertSchema(externalAgents).extend({
  id: resourceIdSchema,
});
export const ExternalAgentUpdateSchema = ExternalAgentInsertSchema.partial();

export const ExternalAgentApiSelectSchema = createGraphScopedApiSchema(ExternalAgentSelectSchema);
export const ExternalAgentApiInsertSchema =
  createGraphScopedApiInsertSchema(ExternalAgentInsertSchema);
export const ExternalAgentApiUpdateSchema =
  createGraphScopedApiUpdateSchema(ExternalAgentUpdateSchema);

// Discriminated union for all agent types
export const AllAgentSchema = z.discriminatedUnion('type', [
  AgentApiSelectSchema.extend({ type: z.literal('internal') }),
  ExternalAgentApiSelectSchema.extend({ type: z.literal('external') }),
]);

// === API Key Schemas ===
export const ApiKeySelectSchema = createSelectSchema(apiKeys);

export const ApiKeyInsertSchema = createInsertSchema(apiKeys).extend({
  id: resourceIdSchema,
  graphId: resourceIdSchema,
});

export const ApiKeyUpdateSchema = ApiKeyInsertSchema.partial().omit({
  tenantId: true,
  projectId: true,
  id: true,
  publicId: true,
  keyHash: true,
  keyPrefix: true,
  createdAt: true,
});

export const ApiKeyApiSelectSchema = ApiKeySelectSchema.omit({
  tenantId: true,
  projectId: true,
  keyHash: true, // Never expose the hash
});

// Custom response schema for API key creation (includes the actual key)
export const ApiKeyApiCreationResponseSchema = z.object({
  data: z.object({
    apiKey: ApiKeyApiSelectSchema,
    key: z.string().describe('The full API key (shown only once)'),
  }),
});

export const ApiKeyApiInsertSchema = ApiKeyInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true, // Auto-generated
  publicId: true, // Auto-generated
  keyHash: true, // Auto-generated
  keyPrefix: true, // Auto-generated
  lastUsedAt: true, // Not set on creation
});

export const ApiKeyApiUpdateSchema = ApiKeyUpdateSchema;

// === Credential Reference Schemas ===
export const CredentialReferenceSelectSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  type: z.string(),
  credentialStoreId: z.string(),
  retrievalParams: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CredentialReferenceInsertSchema = createInsertSchema(credentialReferences).extend({
  id: resourceIdSchema,
  type: z.string(),
  credentialStoreId: resourceIdSchema,
  retrievalParams: z.record(z.string(), z.unknown()).nullish(),
});

export const CredentialReferenceUpdateSchema = CredentialReferenceInsertSchema.partial();

export const CredentialReferenceApiSelectSchema = createApiSchema(
  CredentialReferenceSelectSchema
).extend({
  type: z.enum(CredentialStoreType),
  tools: z.array(ToolSelectSchema).optional(),
});
export const CredentialReferenceApiInsertSchema = createApiInsertSchema(
  CredentialReferenceInsertSchema
).extend({
  type: z.enum(CredentialStoreType),
});
export const CredentialReferenceApiUpdateSchema = createApiUpdateSchema(
  CredentialReferenceUpdateSchema
).extend({
  type: z.enum(CredentialStoreType).optional(),
});

// === MCP Tool Schemas ===
export const McpToolSchema = ToolInsertSchema.extend({
  imageUrl: imageUrlSchema,
  availableTools: z.array(McpToolDefinitionSchema).optional(),
  status: ToolStatusSchema.default('unknown'),
  version: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// MCP Tool Config Schema with mcp specific fields flattened out into the tool definition
export const MCPToolConfigSchema = McpToolSchema.omit({
  config: true,
  tenantId: true,
  projectId: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  credentialReferenceId: true,
}).extend({
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
  description: z.string().optional(),
  serverUrl: z.url(),
  activeTools: z.array(z.string()).optional(),
  mcpType: z.enum(MCPServerType).optional(),
  transport: McpTransportConfigSchema.optional(),
  credential: CredentialReferenceApiInsertSchema.optional(),
});

export const ToolUpdateSchema = ToolInsertSchema.partial();

export const ToolApiSelectSchema = createApiSchema(ToolSelectSchema);
export const ToolApiInsertSchema = createApiInsertSchema(ToolInsertSchema);
export const ToolApiUpdateSchema = createApiUpdateSchema(ToolUpdateSchema);

// === Context Config Schemas ===
// Zod schemas for validation
export const FetchConfigSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  transform: z.string().optional(), // JSONPath or JS transform function
  timeout: z.number().min(0).optional().default(10000).optional(),
});

export const FetchDefinitionSchema = z.object({
  id: z.string().min(1, 'Fetch definition ID is required'),
  name: z.string().optional(),
  trigger: z.enum(['initialization', 'invocation']),
  fetchConfig: FetchConfigSchema,
  responseSchema: z.any().optional(), // JSON Schema for validating HTTP response
  defaultValue: z.unknown().optional(),
  credential: CredentialReferenceApiInsertSchema.optional(),
});

export const ContextConfigSelectSchema = createSelectSchema(contextConfigs).extend({
  requestContextSchema: z.unknown().optional(),
});
export const ContextConfigInsertSchema = createInsertSchema(contextConfigs)
  .extend({
    id: resourceIdSchema,
    requestContextSchema: z.unknown().optional(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ContextConfigUpdateSchema = ContextConfigInsertSchema.partial();

export const ContextConfigApiSelectSchema = createApiSchema(ContextConfigSelectSchema).omit({
  graphId: true,
});
export const ContextConfigApiInsertSchema = createApiInsertSchema(ContextConfigInsertSchema).omit({
  graphId: true,
});
export const ContextConfigApiUpdateSchema = createApiUpdateSchema(ContextConfigUpdateSchema).omit({
  graphId: true,
});

// === Agent Tool Relation Schemas ===
export const AgentToolRelationSelectSchema = createSelectSchema(agentToolRelations);
export const AgentToolRelationInsertSchema = createInsertSchema(agentToolRelations).extend({
  id: resourceIdSchema,
  agentId: resourceIdSchema,
  toolId: resourceIdSchema,
  selectedTools: z.array(z.string()).nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
});

export const AgentToolRelationUpdateSchema = AgentToolRelationInsertSchema.partial();

export const AgentToolRelationApiSelectSchema = createGraphScopedApiSchema(
  AgentToolRelationSelectSchema
);
export const AgentToolRelationApiInsertSchema = createGraphScopedApiInsertSchema(
  AgentToolRelationInsertSchema
);
export const AgentToolRelationApiUpdateSchema = createGraphScopedApiUpdateSchema(
  AgentToolRelationUpdateSchema
);

// === Ledger Artifact Schemas ===
export const LedgerArtifactSelectSchema = createSelectSchema(ledgerArtifacts);
export const LedgerArtifactInsertSchema = createInsertSchema(ledgerArtifacts);
export const LedgerArtifactUpdateSchema = LedgerArtifactInsertSchema.partial();

export const LedgerArtifactApiSelectSchema = createApiSchema(LedgerArtifactSelectSchema);
export const LedgerArtifactApiInsertSchema = createApiInsertSchema(LedgerArtifactInsertSchema);
export const LedgerArtifactApiUpdateSchema = createApiUpdateSchema(LedgerArtifactUpdateSchema);

// === Full Graph Definition Schemas ===
export const StatusComponentSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  detailsSchema: z
    .object({
      type: z.literal('object'),
      properties: z.record(z.string(), z.any()),
      required: z.array(z.string()).optional(),
    })
    .optional(),
});

export const StatusUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  numEvents: z.number().min(1).max(100).optional(),
  timeInSeconds: z.number().min(1).max(600).optional(),
  prompt: z.string().max(2000, 'Custom prompt cannot exceed 2000 characters').optional(),
  statusComponents: z.array(StatusComponentSchema).optional(),
});

export const CanUseItemSchema = z.object({
  agentToolRelationId: z.string().optional(),
  toolId: z.string(),
  toolSelection: z.array(z.string()).nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
});

export const FullGraphAgentInsertSchema = AgentApiInsertSchema.extend({
  type: z.literal('internal'),
  canUse: z.array(CanUseItemSchema),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  canDelegateTo: z.array(z.string()).optional(),
});

export const FullGraphDefinitionSchema = AgentGraphApiInsertSchema.extend({
  agents: z.record(z.string(), z.union([FullGraphAgentInsertSchema, ExternalAgentApiInsertSchema])),
  // Removed project-scoped resources - these are now managed at project level:
  // tools, credentialReferences, dataComponents, artifactComponents
  // Agent relationships to these resources are maintained via agent.tools, agent.dataComponents, etc.
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  statusUpdates: z.optional(StatusUpdateSchema),
  models: ModelSchema.optional(),
  stopWhen: GraphStopWhenSchema.optional(),
  graphPrompt: z.string().max(5000, 'Graph prompt cannot exceed 5000 characters').optional(),
});

export const GraphWithinContextOfProjectSchema = AgentGraphApiInsertSchema.extend({
  agents: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      FullGraphAgentInsertSchema,
      ExternalAgentApiInsertSchema.extend({ type: z.literal('external') }),
    ])
  ),
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  statusUpdates: z.optional(StatusUpdateSchema),
  models: ModelSchema.optional(),
  stopWhen: GraphStopWhenSchema.optional(),
  graphPrompt: z.string().max(5000, 'Graph prompt cannot exceed 5000 characters').optional(),
});

// === Response wrapper schemas ===
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  total: z.number(),
  pages: z.number(),
});

export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export const SingleResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: itemSchema,
  });

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export const ExistsResponseSchema = z.object({
  exists: z.boolean(),
});

export const RemovedResponseSchema = z.object({
  message: z.string(),
  removed: z.boolean(),
});

// === Project Schemas ===
export const ProjectSelectSchema = createSelectSchema(projects);
export const ProjectInsertSchema = createInsertSchema(projects)
  .extend({
    models: ProjectModelSchema,
    stopWhen: StopWhenSchema.optional(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ProjectUpdateSchema = ProjectInsertSchema.partial();

// Projects API schemas - only omit tenantId since projects table doesn't have projectId
export const ProjectApiSelectSchema = ProjectSelectSchema.omit({ tenantId: true });
export const ProjectApiInsertSchema = ProjectInsertSchema.omit({ tenantId: true });
export const ProjectApiUpdateSchema = ProjectUpdateSchema.omit({ tenantId: true });

// Full Project Definition Schema - extends Project with graphs and other nested resources
export const FullProjectDefinitionSchema = ProjectApiInsertSchema.extend({
  graphs: z.record(z.string(), GraphWithinContextOfProjectSchema),
  tools: z.record(z.string(), ToolApiInsertSchema),
  dataComponents: z.record(z.string(), DataComponentApiInsertSchema).optional(),
  artifactComponents: z.record(z.string(), ArtifactComponentApiInsertSchema).optional(),
  statusUpdates: z.optional(StatusUpdateSchema),
  credentialReferences: z.record(z.string(), CredentialReferenceApiInsertSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// === Common parameter schemas ===
export const HeadersScopeSchema = z.object({
  'x-inkeep-tenant-id': z.string().optional().openapi({
    description: 'Tenant identifier',
    example: 'tenant_123',
  }),
  'x-inkeep-project-id': z.string().optional().openapi({
    description: 'Project identifier',
    example: 'project_456',
  }),
  'x-inkeep-graph-id': z.string().optional().openapi({
    description: 'Graph identifier',
    example: 'graph_789',
  }),
});

export const TenantParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
  })
  .openapi('TenantParams');

export const TenantProjectParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
  })
  .openapi('TenantProjectParams');

export const TenantProjectGraphParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
    graphId: z.string().openapi({
      description: 'Graph identifier',
      example: 'graph_789',
    }),
  })
  .openapi('TenantProjectGraphParams');

export const TenantProjectGraphIdParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
    graphId: z.string().openapi({
      description: 'Graph identifier',
      example: 'graph_789',
    }),
    id: resourceIdSchema,
  })
  .openapi('TenantProjectGraphIdParams');

export const TenantProjectIdParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
    id: resourceIdSchema,
  })
  .openapi('TenantProjectIdParams');

export const TenantIdParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    id: resourceIdSchema,
  })
  .openapi('TenantIdParams');

export const IdParamsSchema = z
  .object({
    id: resourceIdSchema,
  })
  .openapi('IdParams');

// === Pagination query parameters ===
export const PaginationQueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});
