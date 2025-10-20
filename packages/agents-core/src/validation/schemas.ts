import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  agents,
  apiKeys,
  artifactComponents,
  contextCache,
  contextConfigs,
  conversations,
  credentialReferences,
  dataComponents,
  externalAgents,
  functions,
  functionTools,
  ledgerArtifacts,
  messages,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentExternalAgentRelations,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
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

export const StopWhenSchema = z
  .object({
    transferCountIs: z.number().min(1).max(100).optional(),
    stepCountIs: z.number().min(1).max(1000).optional(),
  })
  .openapi('StopWhen');

export const AgentStopWhenSchema = StopWhenSchema.pick({ transferCountIs: true }).openapi(
  'AgentStopWhen'
);

export const SubAgentStopWhenSchema = StopWhenSchema.pick({ stepCountIs: true }).openapi(
  'SubAgentStopWhen'
);

export type StopWhen = z.infer<typeof StopWhenSchema>;
export type AgentStopWhen = z.infer<typeof AgentStopWhenSchema>;
export type SubAgentStopWhen = z.infer<typeof SubAgentStopWhenSchema>;

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

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

export const ModelSettingsSchema = z
  .object({
    model: z.string().optional(),
    providerOptions: z.record(z.string(), z.any()).optional(),
  })
  .openapi('ModelSettings');

export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export const ModelSchema = z
  .object({
    base: ModelSettingsSchema.optional(),
    structuredOutput: ModelSettingsSchema.optional(),
    summarizer: ModelSettingsSchema.optional(),
  })
  .openapi('Model');

export const ProjectModelSchema = z
  .object({
    base: ModelSettingsSchema,
    structuredOutput: ModelSettingsSchema.optional(),
    summarizer: ModelSettingsSchema.optional(),
  })
  .openapi('ProjectModel');

export const FunctionToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  dependencies: z.record(z.string(), z.string()).optional(),
  execute: z.union([z.function(), z.string()]),
});

export type FunctionToolConfig = Omit<z.infer<typeof FunctionToolConfigSchema>, 'execute'> & {
  execute: ((params: any) => Promise<any>) | string;
};

const createApiSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }) satisfies z.ZodObject<any>;

const createApiInsertSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }) satisfies z.ZodObject<any>;

const createApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true }).partial() satisfies z.ZodObject<any>;

const createAgentScopedApiSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true, agentId: true }) satisfies z.ZodObject<any>;

const createAgentScopedApiInsertSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.omit({ tenantId: true, projectId: true, agentId: true }) satisfies z.ZodObject<any>;

const createAgentScopedApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema
    .omit({ tenantId: true, projectId: true, agentId: true })
    .partial() satisfies z.ZodObject<any>;

export const SubAgentSelectSchema = createSelectSchema(subAgents);

export const SubAgentInsertSchema = createInsertSchema(subAgents).extend({
  id: resourceIdSchema,
  models: ModelSchema.optional(),
});

export const SubAgentUpdateSchema = SubAgentInsertSchema.partial();

export const SubAgentApiSelectSchema =
  createAgentScopedApiSchema(SubAgentSelectSchema).openapi('SubAgent');
export const SubAgentApiInsertSchema =
  createAgentScopedApiInsertSchema(SubAgentInsertSchema).openapi('SubAgentCreate');
export const SubAgentApiUpdateSchema =
  createAgentScopedApiUpdateSchema(SubAgentUpdateSchema).openapi('SubAgentUpdate');

export const SubAgentRelationSelectSchema = createSelectSchema(subAgentRelations);
export const SubAgentRelationInsertSchema = createInsertSchema(subAgentRelations).extend({
  id: resourceIdSchema,
  agentId: resourceIdSchema,
  sourceSubAgentId: resourceIdSchema,
  targetSubAgentId: resourceIdSchema.optional(),
  externalSubAgentId: resourceIdSchema.optional(),
});
export const SubAgentRelationUpdateSchema = SubAgentRelationInsertSchema.partial();

export const SubAgentRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentRelationSelectSchema
).openapi('SubAgentRelation');
export const SubAgentRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentRelationInsertSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES),
  })
  .refine(
    (data) => {
      const hasTarget = data.targetSubAgentId != null;
      const hasExternal = data.externalSubAgentId != null;
      return hasTarget !== hasExternal; // XOR - exactly one must be true
    },
    {
      message: 'Must specify exactly one of targetSubAgentId or externalSubAgentId',
      path: ['targetSubAgentId', 'externalSubAgentId'],
    }
  )
  .openapi('SubAgentRelationCreate');

export const SubAgentRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentRelationUpdateSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES).optional(),
  })
  .refine(
    (data) => {
      const hasTarget = data.targetSubAgentId != null;
      const hasExternal = data.externalSubAgentId != null;

      if (!hasTarget && !hasExternal) {
        return true;
      }

      return hasTarget !== hasExternal; // XOR - exactly one must be true
    },
    {
      message:
        'Must specify exactly one of targetSubAgentId or externalSubAgentId when updating sub-agent relationships',
      path: ['targetSubAgentId', 'externalSubAgentId'],
    }
  )
  .openapi('SubAgentRelationUpdate');

export const SubAgentRelationQuerySchema = z.object({
  sourceSubAgentId: z.string().optional(),
  targetSubAgentId: z.string().optional(),
  externalSubAgentId: z.string().optional(),
});

export const ExternalSubAgentRelationInsertSchema = createInsertSchema(subAgentRelations).extend({
  id: resourceIdSchema,
  agentId: resourceIdSchema,
  sourceSubAgentId: resourceIdSchema,
  externalSubAgentId: resourceIdSchema,
});

export const ExternalSubAgentRelationApiInsertSchema = createApiInsertSchema(
  ExternalSubAgentRelationInsertSchema
);

export const AgentSelectSchema = createSelectSchema(agents);
export const AgentInsertSchema = createInsertSchema(agents).extend({
  id: resourceIdSchema,
});
export const AgentUpdateSchema = AgentInsertSchema.partial();

export const AgentApiSelectSchema = createApiSchema(AgentSelectSchema).openapi('Agent');
export const AgentApiInsertSchema = createApiInsertSchema(AgentInsertSchema)
  .extend({
    id: resourceIdSchema,
  })
  .openapi('AgentCreate');
export const AgentApiUpdateSchema = createApiUpdateSchema(AgentUpdateSchema).openapi('AgentUpdate');

export const TaskSelectSchema = createSelectSchema(tasks);
export const TaskInsertSchema = createInsertSchema(tasks).extend({
  id: resourceIdSchema,
  conversationId: resourceIdSchema.optional(),
});
export const TaskUpdateSchema = TaskInsertSchema.partial();

export const TaskApiSelectSchema = createApiSchema(TaskSelectSchema);
export const TaskApiInsertSchema = createApiInsertSchema(TaskInsertSchema);
export const TaskApiUpdateSchema = createApiUpdateSchema(TaskUpdateSchema);

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

const imageUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url) return true; // Optional field
      if (url.startsWith('data:image/')) {
        const base64Part = url.split(',')[1];
        if (!base64Part) return false;
        return base64Part.length < 1400000; // ~1MB limit
      }
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

export const McpTransportConfigSchema = z
  .object({
    type: z.enum(MCPTransportType),
    requestInit: z.record(z.string(), z.unknown()).optional(),
    eventSourceInit: z.record(z.string(), z.unknown()).optional(),
    reconnectionOptions: z.any().optional().openapi({
      type: 'object',
      description: 'Reconnection options for streamable HTTP transport',
    }),
    sessionId: z.string().optional(),
  })
  .openapi('McpTransportConfig');

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
  config: z.object({
    type: z.literal('mcp'),
    mcp: z.object({
      server: z.object({
        url: z.url(),
      }),
      transport: z
        .object({
          type: z.enum(MCPTransportType),
          requestInit: z.record(z.string(), z.unknown()).optional(),
          eventSourceInit: z.record(z.string(), z.unknown()).optional(),
          reconnectionOptions: z.any().optional().openapi({
            type: 'object',
            description: 'Reconnection options for streamable HTTP transport',
          }),
          sessionId: z.string().optional(),
        })
        .optional(),
      activeTools: z.array(z.string()).optional(),
    }),
  }),
});

export const ConversationSelectSchema = createSelectSchema(conversations);
export const ConversationInsertSchema = createInsertSchema(conversations).extend({
  id: resourceIdSchema,
  contextConfigId: resourceIdSchema.optional(),
});
export const ConversationUpdateSchema = ConversationInsertSchema.partial();

export const ConversationApiSelectSchema =
  createApiSchema(ConversationSelectSchema).openapi('Conversation');
export const ConversationApiInsertSchema =
  createApiInsertSchema(ConversationInsertSchema).openapi('ConversationCreate');
export const ConversationApiUpdateSchema =
  createApiUpdateSchema(ConversationUpdateSchema).openapi('ConversationUpdate');

export const MessageSelectSchema = createSelectSchema(messages);
export const MessageInsertSchema = createInsertSchema(messages).extend({
  id: resourceIdSchema,
  conversationId: resourceIdSchema,
  taskId: resourceIdSchema.optional(),
});
export const MessageUpdateSchema = MessageInsertSchema.partial();

export const MessageApiSelectSchema = createApiSchema(MessageSelectSchema).openapi('Message');
export const MessageApiInsertSchema =
  createApiInsertSchema(MessageInsertSchema).openapi('MessageCreate');
export const MessageApiUpdateSchema =
  createApiUpdateSchema(MessageUpdateSchema).openapi('MessageUpdate');

export const ContextCacheSelectSchema = createSelectSchema(contextCache);
export const ContextCacheInsertSchema = createInsertSchema(contextCache);
export const ContextCacheUpdateSchema = ContextCacheInsertSchema.partial();

export const ContextCacheApiSelectSchema = createApiSchema(ContextCacheSelectSchema);
export const ContextCacheApiInsertSchema = createApiInsertSchema(ContextCacheInsertSchema);
export const ContextCacheApiUpdateSchema = createApiUpdateSchema(ContextCacheUpdateSchema);

export const DataComponentSelectSchema = createSelectSchema(dataComponents);
export const DataComponentInsertSchema = createInsertSchema(dataComponents).extend({
  id: resourceIdSchema,
});
export const DataComponentBaseSchema = DataComponentInsertSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const DataComponentUpdateSchema = DataComponentInsertSchema.partial();

export const DataComponentApiSelectSchema =
  createApiSchema(DataComponentSelectSchema).openapi('DataComponent');
export const DataComponentApiInsertSchema =
  createApiInsertSchema(DataComponentInsertSchema).openapi('DataComponentCreate');
export const DataComponentApiUpdateSchema =
  createApiUpdateSchema(DataComponentUpdateSchema).openapi('DataComponentUpdate');

export const SubAgentDataComponentSelectSchema = createSelectSchema(subAgentDataComponents);
export const SubAgentDataComponentInsertSchema = createInsertSchema(subAgentDataComponents);
export const SubAgentDataComponentUpdateSchema = SubAgentDataComponentInsertSchema.partial();

export const SubAgentDataComponentApiSelectSchema = createAgentScopedApiSchema(
  SubAgentDataComponentSelectSchema
);
export const SubAgentDataComponentApiInsertSchema = SubAgentDataComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const SubAgentDataComponentApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentDataComponentUpdateSchema
);

export const ArtifactComponentSelectSchema = createSelectSchema(artifactComponents);
export const ArtifactComponentInsertSchema = createInsertSchema(artifactComponents).extend({
  id: resourceIdSchema,
});
export const ArtifactComponentUpdateSchema = ArtifactComponentInsertSchema.partial();

export const ArtifactComponentApiSelectSchema = createApiSchema(
  ArtifactComponentSelectSchema
).openapi('ArtifactComponent');
export const ArtifactComponentApiInsertSchema = ArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
}).openapi('ArtifactComponentCreate');
export const ArtifactComponentApiUpdateSchema = createApiUpdateSchema(
  ArtifactComponentUpdateSchema
).openapi('ArtifactComponentUpdate');

export const SubAgentArtifactComponentSelectSchema = createSelectSchema(subAgentArtifactComponents);
export const SubAgentArtifactComponentInsertSchema = createInsertSchema(
  subAgentArtifactComponents
).extend({
  id: resourceIdSchema,
  subAgentId: resourceIdSchema,
  artifactComponentId: resourceIdSchema,
});
export const SubAgentArtifactComponentUpdateSchema =
  SubAgentArtifactComponentInsertSchema.partial();

export const SubAgentArtifactComponentApiSelectSchema = createAgentScopedApiSchema(
  SubAgentArtifactComponentSelectSchema
);
export const SubAgentArtifactComponentApiInsertSchema = SubAgentArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const SubAgentArtifactComponentApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentArtifactComponentUpdateSchema
);

export const ExternalAgentSelectSchema = createSelectSchema(externalAgents).extend({
  credentialReferenceId: z.string().nullable().optional(),
});
export const ExternalAgentInsertSchema = createInsertSchema(externalAgents).extend({
  id: resourceIdSchema,
});
export const ExternalAgentUpdateSchema = ExternalAgentInsertSchema.partial();

export const ExternalAgentApiSelectSchema =
  createApiSchema(ExternalAgentSelectSchema).openapi('ExternalAgent');
export const ExternalAgentApiInsertSchema =
  createApiInsertSchema(ExternalAgentInsertSchema).openapi('ExternalAgentCreate');
export const ExternalAgentApiUpdateSchema =
  createApiUpdateSchema(ExternalAgentUpdateSchema).openapi('ExternalAgentUpdate');

export const AllAgentSchema = z.discriminatedUnion('type', [
  SubAgentApiSelectSchema.extend({ type: z.literal('internal') }),
  ExternalAgentApiSelectSchema.extend({ type: z.literal('external') }),
]);

export const ApiKeySelectSchema = createSelectSchema(apiKeys);

export const ApiKeyInsertSchema = createInsertSchema(apiKeys).extend({
  id: resourceIdSchema,
  agentId: resourceIdSchema,
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
}).openapi('ApiKey');

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
}).openapi('ApiKeyCreate');

export const ApiKeyApiUpdateSchema = ApiKeyUpdateSchema.openapi('ApiKeyUpdate');

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

export const CredentialReferenceApiSelectSchema = createApiSchema(CredentialReferenceSelectSchema)
  .extend({
    type: z.enum(CredentialStoreType),
    tools: z.array(ToolSelectSchema).optional(),
    externalAgents: z.array(ExternalAgentSelectSchema).optional(),
  })
  .openapi('CredentialReference');
export const CredentialReferenceApiInsertSchema = createApiInsertSchema(
  CredentialReferenceInsertSchema
)
  .extend({
    type: z.enum(CredentialStoreType),
  })
  .openapi('CredentialReferenceCreate');
export const CredentialReferenceApiUpdateSchema = createApiUpdateSchema(
  CredentialReferenceUpdateSchema
)
  .extend({
    type: z.enum(CredentialStoreType).optional(),
  })
  .openapi('CredentialReferenceUpdate');

export const McpToolSchema = ToolInsertSchema.extend({
  imageUrl: imageUrlSchema,
  availableTools: z.array(McpToolDefinitionSchema).optional(),
  status: ToolStatusSchema.default('unknown'),
  version: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().optional(),
});

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

export const ToolApiSelectSchema = createApiSchema(ToolSelectSchema).openapi('Tool');
export const ToolApiInsertSchema = createApiInsertSchema(ToolInsertSchema).openapi('ToolCreate');
export const ToolApiUpdateSchema = createApiUpdateSchema(ToolUpdateSchema).openapi('ToolUpdate');

export const FunctionToolSelectSchema = createSelectSchema(functionTools);

export const FunctionToolInsertSchema = createInsertSchema(functionTools).extend({
  id: resourceIdSchema,
});

export const FunctionToolUpdateSchema = FunctionToolInsertSchema.partial();

export const FunctionToolApiSelectSchema =
  createApiSchema(FunctionToolSelectSchema).openapi('FunctionTool');
export const FunctionToolApiInsertSchema =
  createAgentScopedApiInsertSchema(FunctionToolInsertSchema).openapi('FunctionToolCreate');
export const FunctionToolApiUpdateSchema =
  createApiUpdateSchema(FunctionToolUpdateSchema).openapi('FunctionToolUpdate');

export const FunctionSelectSchema = createSelectSchema(functions);
export const FunctionInsertSchema = createInsertSchema(functions).extend({
  id: resourceIdSchema,
});
export const FunctionUpdateSchema = FunctionInsertSchema.partial();

export const FunctionApiSelectSchema = createApiSchema(FunctionSelectSchema).openapi('Function');
export const FunctionApiInsertSchema =
  createApiInsertSchema(FunctionInsertSchema).openapi('FunctionCreate');
export const FunctionApiUpdateSchema =
  createApiUpdateSchema(FunctionUpdateSchema).openapi('FunctionUpdate');

// Zod schemas for validation
export const FetchConfigSchema = z
  .object({
    url: z.string().min(1, 'URL is required'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
    transform: z.string().optional(), // JSONPath or JS transform function
    timeout: z.number().min(0).optional().default(10000).optional(),
  })
  .openapi('FetchConfig');

export const FetchDefinitionSchema = z
  .object({
    id: z.string().min(1, 'Fetch definition ID is required'),
    name: z.string().optional(),
    trigger: z.enum(['initialization', 'invocation']),
    fetchConfig: FetchConfigSchema,
    responseSchema: z.any().optional(), // JSON Schema for validating HTTP response
    defaultValue: z.any().optional().openapi({
      description: 'Default value if fetch fails',
    }),
    credential: CredentialReferenceApiInsertSchema.optional(),
  })
  .openapi('FetchDefinition');

export const ContextConfigSelectSchema = createSelectSchema(contextConfigs).extend({
  headersSchema: z.any().optional().openapi({
    type: 'object',
    description: 'JSON Schema for validating request headers',
  }),
});
export const ContextConfigInsertSchema = createInsertSchema(contextConfigs)
  .extend({
    id: resourceIdSchema.optional(),
    headersSchema: z.any().nullable().optional().openapi({
      type: 'object',
      description: 'JSON Schema for validating request headers',
    }),
    contextVariables: z.any().nullable().optional().openapi({
      type: 'object',
      description: 'Context variables configuration with fetch definitions',
    }),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ContextConfigUpdateSchema = ContextConfigInsertSchema.partial();

export const ContextConfigApiSelectSchema = createApiSchema(ContextConfigSelectSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfig');
export const ContextConfigApiInsertSchema = createApiInsertSchema(ContextConfigInsertSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfigCreate');
export const ContextConfigApiUpdateSchema = createApiUpdateSchema(ContextConfigUpdateSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfigUpdate');

export const SubAgentToolRelationSelectSchema = createSelectSchema(subAgentToolRelations);
export const SubAgentToolRelationInsertSchema = createInsertSchema(subAgentToolRelations).extend({
  id: resourceIdSchema,
  subAgentId: resourceIdSchema,
  toolId: resourceIdSchema,
  selectedTools: z.array(z.string()).nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
});

export const SubAgentToolRelationUpdateSchema = SubAgentToolRelationInsertSchema.partial();

export const SubAgentToolRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentToolRelationSelectSchema
).openapi('SubAgentToolRelation');
export const SubAgentToolRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentToolRelationInsertSchema
).openapi('SubAgentToolRelationCreate');
export const SubAgentToolRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentToolRelationUpdateSchema
).openapi('SubAgentToolRelationUpdate');

// Sub-Agent External Agent Relation Schemas
export const SubAgentExternalAgentRelationSelectSchema = createSelectSchema(
  subAgentExternalAgentRelations
);
export const SubAgentExternalAgentRelationInsertSchema = createInsertSchema(
  subAgentExternalAgentRelations
).extend({
  id: resourceIdSchema,
  subAgentId: resourceIdSchema,
  externalAgentId: resourceIdSchema,
  headers: z.record(z.string(), z.string()).nullish(),
});

export const SubAgentExternalAgentRelationUpdateSchema =
  SubAgentExternalAgentRelationInsertSchema.partial();

export const SubAgentExternalAgentRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentExternalAgentRelationSelectSchema
).openapi('SubAgentExternalAgentRelation');
export const SubAgentExternalAgentRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentExternalAgentRelationInsertSchema
)
  .omit({ id: true, subAgentId: true })
  .openapi('SubAgentExternalAgentRelationCreate');
export const SubAgentExternalAgentRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentExternalAgentRelationUpdateSchema
).openapi('SubAgentExternalAgentRelationUpdate');

export const LedgerArtifactSelectSchema = createSelectSchema(ledgerArtifacts);
export const LedgerArtifactInsertSchema = createInsertSchema(ledgerArtifacts);
export const LedgerArtifactUpdateSchema = LedgerArtifactInsertSchema.partial();

export const LedgerArtifactApiSelectSchema = createApiSchema(LedgerArtifactSelectSchema);
export const LedgerArtifactApiInsertSchema = createApiInsertSchema(LedgerArtifactInsertSchema);
export const LedgerArtifactApiUpdateSchema = createApiUpdateSchema(LedgerArtifactUpdateSchema);

export const StatusComponentSchema = z
  .object({
    type: z.string(),
    description: z.string().optional(),
    detailsSchema: z
      .object({
        type: z.literal('object'),
        properties: z.record(z.string(), z.any()),
        required: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .openapi('StatusComponent');

export const StatusUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    numEvents: z.number().min(1).max(100).optional(),
    timeInSeconds: z.number().min(1).max(600).optional(),
    prompt: z.string().max(2000, 'Custom prompt cannot exceed 2000 characters').optional(),
    statusComponents: z.array(StatusComponentSchema).optional(),
  })
  .openapi('StatusUpdate');

export const CanUseItemSchema = z
  .object({
    agentToolRelationId: z.string().optional(),
    toolId: z.string(),
    toolSelection: z.array(z.string()).nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
  })
  .openapi('CanUseItem');

export const canDelegateToExternalAgentSchema = z.object({
  externalAgentId: z.string(),
  subAgentExternalAgentRelationId: z.string().optional(),
  headers: z.record(z.string(), z.string()).nullish(),
});

export const FullAgentAgentInsertSchema = SubAgentApiInsertSchema.extend({
  type: z.literal('internal'),
  canUse: z.array(CanUseItemSchema), // All tools (both MCP and function tools)
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  canDelegateTo: z
    .array(
      z.union([
        z.string(), // Internal subAgent ID
        canDelegateToExternalAgentSchema, // External agent with headers
      ])
    )
    .optional(),
});

export const AgentWithinContextOfProjectSchema = AgentApiInsertSchema.extend({
  subAgents: z.record(z.string(), FullAgentAgentInsertSchema), // Lookup maps for UI to resolve canUse items
  tools: z.record(z.string(), ToolApiInsertSchema).optional(), // MCP tools (project-scoped)
  externalAgents: z.record(z.string(), ExternalAgentApiInsertSchema).optional(), // External agents (project-scoped)
  functionTools: z.record(z.string(), FunctionToolApiInsertSchema).optional(), // Function tools (agent-scoped)
  functions: z.record(z.string(), FunctionApiInsertSchema).optional(), // Get function code for function tools
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  statusUpdates: z.optional(StatusUpdateSchema),
  models: ModelSchema.optional(),
  stopWhen: AgentStopWhenSchema.optional(),
  prompt: z.string().max(5000, 'Agent prompt cannot exceed 5000 characters').optional(),
});

export const PaginationSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(10),
    total: z.number(),
    pages: z.number(),
  })
  .openapi('Pagination');

export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export const SingleResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: itemSchema,
  });

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    details: z.any().optional().openapi({
      description: 'Additional error details',
    }),
  })
  .openapi('ErrorResponse');

export const ExistsResponseSchema = z
  .object({
    exists: z.boolean(),
  })
  .openapi('ExistsResponse');

export const RemovedResponseSchema = z
  .object({
    message: z.string(),
    removed: z.boolean(),
  })
  .openapi('RemovedResponse');

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
export const ProjectApiSelectSchema = ProjectSelectSchema.omit({ tenantId: true }).openapi(
  'Project'
);
export const ProjectApiInsertSchema = ProjectInsertSchema.omit({ tenantId: true }).openapi(
  'ProjectCreate'
);
export const ProjectApiUpdateSchema = ProjectUpdateSchema.omit({ tenantId: true }).openapi(
  'ProjectUpdate'
);

// Full Project Definition Schema - extends Project with agents and other nested resources
export const FullProjectDefinitionSchema = ProjectApiInsertSchema.extend({
  agents: z.record(z.string(), AgentWithinContextOfProjectSchema),
  tools: z.record(z.string(), ToolApiInsertSchema),
  functions: z.record(z.string(), FunctionApiInsertSchema).optional(),
  dataComponents: z.record(z.string(), DataComponentApiInsertSchema).optional(),
  artifactComponents: z.record(z.string(), ArtifactComponentApiInsertSchema).optional(),
  externalAgents: z.record(z.string(), ExternalAgentApiInsertSchema).optional(),
  statusUpdates: z.optional(StatusUpdateSchema),
  credentialReferences: z.record(z.string(), CredentialReferenceApiInsertSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Single item response wrappers
export const ProjectResponse = z
  .object({ data: ProjectApiSelectSchema })
  .openapi('ProjectResponse');
export const SubAgentResponse = z
  .object({ data: SubAgentApiSelectSchema })
  .openapi('SubAgentResponse');
export const AgentResponse = z.object({ data: AgentApiSelectSchema }).openapi('AgentResponse');
export const ToolResponse = z.object({ data: ToolApiSelectSchema }).openapi('ToolResponse');
export const ExternalAgentResponse = z
  .object({ data: ExternalAgentApiSelectSchema })
  .openapi('ExternalAgentResponse');
export const ContextConfigResponse = z
  .object({ data: ContextConfigApiSelectSchema })
  .openapi('ContextConfigResponse');
export const ApiKeyResponse = z.object({ data: ApiKeyApiSelectSchema }).openapi('ApiKeyResponse');
export const CredentialReferenceResponse = z
  .object({ data: CredentialReferenceApiSelectSchema })
  .openapi('CredentialReferenceResponse');
export const FunctionResponse = z
  .object({ data: FunctionApiSelectSchema })
  .openapi('FunctionResponse');
export const FunctionToolResponse = z
  .object({ data: FunctionToolApiSelectSchema })
  .openapi('FunctionToolResponse');
export const DataComponentResponse = z
  .object({ data: DataComponentApiSelectSchema })
  .openapi('DataComponentResponse');
export const ArtifactComponentResponse = z
  .object({ data: ArtifactComponentApiSelectSchema })
  .openapi('ArtifactComponentResponse');
export const SubAgentRelationResponse = z
  .object({ data: SubAgentRelationApiSelectSchema })
  .openapi('SubAgentRelationResponse');
export const SubAgentToolRelationResponse = z
  .object({ data: SubAgentToolRelationApiSelectSchema })
  .openapi('SubAgentToolRelationResponse');
export const ConversationResponse = z
  .object({ data: ConversationApiSelectSchema })
  .openapi('ConversationResponse');
export const MessageResponse = z
  .object({ data: MessageApiSelectSchema })
  .openapi('MessageResponse');

export const ProjectListResponse = z
  .object({
    data: z.array(ProjectApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ProjectListResponse');
export const SubAgentListResponse = z
  .object({
    data: z.array(SubAgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentListResponse');
export const AgentListResponse = z
  .object({
    data: z.array(AgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('AgentListResponse');
export const ToolListResponse = z
  .object({
    data: z.array(ToolApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ToolListResponse');
export const ExternalAgentListResponse = z
  .object({
    data: z.array(ExternalAgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ExternalAgentListResponse');
export const ContextConfigListResponse = z
  .object({
    data: z.array(ContextConfigApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ContextConfigListResponse');
export const ApiKeyListResponse = z
  .object({
    data: z.array(ApiKeyApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ApiKeyListResponse');
export const CredentialReferenceListResponse = z
  .object({
    data: z.array(CredentialReferenceApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('CredentialReferenceListResponse');
export const FunctionListResponse = z
  .object({
    data: z.array(FunctionApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('FunctionListResponse');
export const FunctionToolListResponse = z
  .object({
    data: z.array(FunctionToolApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('FunctionToolListResponse');
export const DataComponentListResponse = z
  .object({
    data: z.array(DataComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('DataComponentListResponse');
export const ArtifactComponentListResponse = z
  .object({
    data: z.array(ArtifactComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ArtifactComponentListResponse');
export const SubAgentRelationListResponse = z
  .object({
    data: z.array(SubAgentRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentRelationListResponse');
export const SubAgentToolRelationListResponse = z
  .object({
    data: z.array(SubAgentToolRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentToolRelationListResponse');
export const ConversationListResponse = z
  .object({
    data: z.array(ConversationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ConversationListResponse');
export const MessageListResponse = z
  .object({
    data: z.array(MessageApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('MessageListResponse');
export const SubAgentDataComponentResponse = z
  .object({ data: SubAgentDataComponentApiSelectSchema })
  .openapi('SubAgentDataComponentResponse');
export const SubAgentArtifactComponentResponse = z
  .object({ data: SubAgentArtifactComponentApiSelectSchema })
  .openapi('SubAgentArtifactComponentResponse');
export const SubAgentDataComponentListResponse = z
  .object({
    data: z.array(SubAgentDataComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentDataComponentListResponse');
export const SubAgentArtifactComponentListResponse = z
  .object({
    data: z.array(SubAgentArtifactComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentArtifactComponentListResponse');

export const HeadersScopeSchema = z.object({
  'x-inkeep-tenant-id': z.string().optional().openapi({
    description: 'Tenant identifier',
    example: 'tenant_123',
  }),
  'x-inkeep-project-id': z.string().optional().openapi({
    description: 'Project identifier',
    example: 'project_456',
  }),
  'x-inkeep-agent-id': z.string().optional().openapi({
    description: 'Agent identifier',
    example: 'agent_789',
  }),
});

const TenantId = z.string().openapi({
  description: 'Tenant identifier',
  example: 'tenant_123',
});

const ProjectId = z.string().openapi({
  description: 'Project identifier',
  example: 'project_456',
});

const AgentId = z.string().openapi({
  description: 'Agent identifier',
  example: 'agent_789',
});

const SubAgentId = z.string().openapi({
  description: 'Sub-agent identifier',
  example: 'sub_agent_123',
});

export const TenantParamsSchema = z
  .object({
    tenantId: TenantId,
  })
  .openapi('TenantParams');

export const TenantIdParamsSchema = TenantParamsSchema.extend({
  id: resourceIdSchema,
}).openapi('TenantIdParams');

export const TenantProjectParamsSchema = TenantParamsSchema.extend({
  projectId: ProjectId,
}).openapi('TenantProjectParams');

export const TenantProjectIdParamsSchema = TenantProjectParamsSchema.extend({
  id: resourceIdSchema,
}).openapi('TenantProjectIdParams');

export const TenantProjectAgentParamsSchema = TenantProjectParamsSchema.extend({
  agentId: AgentId,
}).openapi('TenantProjectAgentParams');

export const TenantProjectAgentIdParamsSchema = TenantProjectAgentParamsSchema.extend({
  id: resourceIdSchema,
}).openapi('TenantProjectAgentIdParams');

export const TenantProjectAgentSubAgentParamsSchema = TenantProjectAgentParamsSchema.extend({
  subAgentId: SubAgentId,
}).openapi('TenantProjectAgentSubAgentParams');

export const TenantProjectAgentSubAgentIdParamsSchema =
  TenantProjectAgentSubAgentParamsSchema.extend({
    id: resourceIdSchema,
  }).openapi('TenantProjectAgentSubAgentIdParams');

export const PaginationQueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});
