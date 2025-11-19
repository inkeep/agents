import { relations } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import type { Part } from '../types/a2a';
import type {
  ContextFetchDefinition,
  ConversationHistoryConfig,
  ConversationMetadata,
  MessageContent,
  MessageMetadata,
  Models,
  ProjectModels,
  StatusUpdateSettings,
  TaskMetadataConfig,
  ToolMcpConfig,
  ToolServerCapabilities,
} from '../types/utility';
import type { AgentStopWhen, StopWhen, SubAgentStopWhen } from '../validation/schemas';

const tenantScoped = {
  tenantId: varchar('tenant_id', { length: 256 }).notNull(),
  id: varchar('id', { length: 256 }).notNull(),
};

const projectScoped = {
  ...tenantScoped,
  projectId: varchar('project_id', { length: 256 }).notNull(),
};

const agentScoped = {
  ...projectScoped,
  agentId: varchar('agent_id', { length: 256 }).notNull(),
};

const subAgentScoped = {
  ...agentScoped,
  subAgentId: varchar('sub_agent_id', { length: 256 }).notNull(),
};

const uiProperties = {
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description').notNull(),
};

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};

export const projects = pgTable(
  'projects',
  {
    ...tenantScoped,
    ...uiProperties,

    models: jsonb('models').$type<ProjectModels>(),

    stopWhen: jsonb('stop_when').$type<StopWhen>(),

    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

export const agents = pgTable(
  'agent',
  {
    ...projectScoped,
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    defaultSubAgentId: varchar('default_sub_agent_id', { length: 256 }),
    contextConfigId: varchar('context_config_id', { length: 256 }),
    models: jsonb('models').$type<Models>(),
    statusUpdates: jsonb('status_updates').$type<StatusUpdateSettings>(),
    prompt: text('prompt'),
    stopWhen: jsonb('stop_when').$type<AgentStopWhen>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'agent_project_fk',
    }).onDelete('cascade'),
  ]
);

export const contextConfigs = pgTable(
  'context_configs',
  {
    ...agentScoped,

    headersSchema: jsonb('headers_schema').$type<unknown>(),

    contextVariables: jsonb('context_variables').$type<Record<string, ContextFetchDefinition>>(),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'context_configs_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const contextCache = pgTable(
  'context_cache',
  {
    ...projectScoped,

    conversationId: varchar('conversation_id', { length: 256 }).notNull(),

    contextConfigId: varchar('context_config_id', { length: 256 }).notNull(),
    contextVariableKey: varchar('context_variable_key', { length: 256 }).notNull(),
    value: jsonb('value').$type<unknown>().notNull(),

    requestHash: varchar('request_hash', { length: 256 }),

    fetchedAt: timestamp('fetched_at', { mode: 'string' }).notNull().defaultNow(),
    fetchSource: varchar('fetch_source', { length: 256 }),
    fetchDurationMs: integer('fetch_duration_ms'),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'context_cache_project_fk',
    }).onDelete('cascade'),
    index('context_cache_lookup_idx').on(
      table.conversationId,
      table.contextConfigId,
      table.contextVariableKey
    ),
  ]
);

export const subAgents = pgTable(
  'sub_agents',
  {
    ...agentScoped,
    ...uiProperties,
    prompt: text('prompt').notNull(),
    conversationHistoryConfig: jsonb('conversation_history_config')
      .$type<ConversationHistoryConfig>()
      .default({
        mode: 'full',
        limit: 50,
        maxOutputTokens: 4000,
        includeInternal: false,
        messageTypes: ['chat', 'tool-result'],
      }),
    models: jsonb('models').$type<Models>(),
    stopWhen: jsonb('stop_when').$type<SubAgentStopWhen>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'sub_agents_agents_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentRelations = pgTable(
  'sub_agent_relations',
  {
    ...agentScoped,
    sourceSubAgentId: varchar('source_sub_agent_id', { length: 256 }).notNull(),
    targetSubAgentId: varchar('target_sub_agent_id', { length: 256 }),
    relationType: varchar('relation_type', { length: 256 }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'sub_agent_relations_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const externalAgents = pgTable(
  'external_agents',
  {
    ...projectScoped,
    ...uiProperties,
    baseUrl: text('base_url').notNull(),
    credentialReferenceId: varchar('credential_reference_id', { length: 256 }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'external_agents_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.credentialReferenceId],
      foreignColumns: [
        credentialReferences.tenantId,
        credentialReferences.projectId,
        credentialReferences.id,
      ],
      name: 'external_agents_credential_reference_fk',
    }).onDelete('cascade'),
  ]
);

export const tasks = pgTable(
  'tasks',
  {
    ...subAgentScoped,
    contextId: varchar('context_id', { length: 256 }).notNull(),
    status: varchar('status', { length: 256 }).notNull(),
    metadata: jsonb('metadata').$type<TaskMetadataConfig>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'tasks_sub_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const taskRelations = pgTable(
  'task_relations',
  {
    ...projectScoped,
    parentTaskId: varchar('parent_task_id', { length: 256 }).notNull(),
    childTaskId: varchar('child_task_id', { length: 256 }).notNull(),
    relationType: varchar('relation_type', { length: 256 }).default('parent_child'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'task_relations_project_fk',
    }).onDelete('cascade'),
  ]
);

export const dataComponents = pgTable(
  'data_components',
  {
    ...projectScoped,
    ...uiProperties,
    props: jsonb('props').$type<Record<string, unknown>>(),
    render: jsonb('render').$type<{
      component: string;
      mockData: Record<string, unknown>;
    }>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'data_components_project_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentDataComponents = pgTable(
  'sub_agent_data_components',
  {
    ...subAgentScoped,
    dataComponentId: varchar('data_component_id', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_data_components_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.dataComponentId],
      foreignColumns: [dataComponents.tenantId, dataComponents.projectId, dataComponents.id],
      name: 'sub_agent_data_components_data_component_fk',
    }).onDelete('cascade'),
  ]
);

export const artifactComponents = pgTable(
  'artifact_components',
  {
    ...projectScoped,
    ...uiProperties,
    props: jsonb('props').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'artifact_components_project_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentArtifactComponents = pgTable(
  'sub_agent_artifact_components',
  {
    ...subAgentScoped,
    artifactComponentId: varchar('artifact_component_id', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId, table.id],
      name: 'sub_agent_artifact_components_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_artifact_components_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.artifactComponentId],
      foreignColumns: [
        artifactComponents.tenantId,
        artifactComponents.projectId,
        artifactComponents.id,
      ],
      name: 'sub_agent_artifact_components_artifact_component_fk',
    }).onDelete('cascade'),
  ]
);

export const tools = pgTable(
  'tools',
  {
    ...projectScoped,
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),

    config: jsonb('config')
      .$type<{
        type: 'mcp';
        mcp: ToolMcpConfig;
      }>()
      .notNull(),

    credentialReferenceId: varchar('credential_reference_id', { length: 256 }),
    headers: jsonb('headers').$type<Record<string, string>>(),

    imageUrl: text('image_url'),

    capabilities: jsonb('capabilities').$type<ToolServerCapabilities>(),

    lastError: text('last_error'),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'tools_project_fk',
    }).onDelete('cascade'),
  ]
);

export const functionTools = pgTable(
  'function_tools',
  {
    ...agentScoped,
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    functionId: varchar('function_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'function_tools_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.functionId],
      foreignColumns: [functions.tenantId, functions.projectId, functions.id],
      name: 'function_tools_function_fk',
    }).onDelete('cascade'),
  ]
);

export const functions = pgTable(
  'functions',
  {
    ...projectScoped,
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>(),
    executeCode: text('execute_code').notNull(),
    dependencies: jsonb('dependencies').$type<Record<string, string>>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'functions_project_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentToolRelations = pgTable(
  'sub_agent_tool_relations',
  {
    ...subAgentScoped,
    toolId: varchar('tool_id', { length: 256 }).notNull(),
    selectedTools: jsonb('selected_tools').$type<string[] | null>(),
    headers: jsonb('headers').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_tool_relations_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.toolId],
      foreignColumns: [tools.tenantId, tools.projectId, tools.id],
      name: 'sub_agent_tool_relations_tool_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentExternalAgentRelations = pgTable(
  'sub_agent_external_agent_relations',
  {
    ...subAgentScoped,
    externalAgentId: varchar('external_agent_id', { length: 256 }).notNull(),
    headers: jsonb('headers').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.id],
      name: 'sub_agent_external_agent_relations_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_external_agent_relations_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.externalAgentId],
      foreignColumns: [externalAgents.tenantId, externalAgents.projectId, externalAgents.id],
      name: 'sub_agent_external_agent_relations_external_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentTeamAgentRelations = pgTable(
  'sub_agent_team_agent_relations',
  {
    ...subAgentScoped,
    targetAgentId: varchar('target_agent_id', { length: 256 }).notNull(),
    headers: jsonb('headers').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.id],
      name: 'sub_agent_team_agent_relations_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_team_agent_relations_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.targetAgentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'sub_agent_team_agent_relations_target_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentFunctionToolRelations = pgTable(
  'sub_agent_function_tool_relations',
  {
    ...subAgentScoped,
    functionToolId: varchar('function_tool_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.id],
      name: 'sub_agent_function_tool_relations_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_function_tool_relations_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.functionToolId],
      foreignColumns: [
        functionTools.tenantId,
        functionTools.projectId,
        functionTools.agentId,
        functionTools.id,
      ],
      name: 'sub_agent_function_tool_relations_function_tool_fk',
    }).onDelete('cascade'),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    ...projectScoped,
    userId: varchar('user_id', { length: 256 }),
    activeSubAgentId: varchar('active_sub_agent_id', { length: 256 }).notNull(),
    title: text('title'),
    lastContextResolution: timestamp('last_context_resolution', { mode: 'string' }),
    metadata: jsonb('metadata').$type<ConversationMetadata>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'conversations_project_fk',
    }).onDelete('cascade'),
  ]
);

export const messages = pgTable(
  'messages',
  {
    ...projectScoped,
    conversationId: varchar('conversation_id', { length: 256 }).notNull(),

    role: varchar('role', { length: 256 }).notNull(),

    fromSubAgentId: varchar('from_sub_agent_id', { length: 256 }),
    toSubAgentId: varchar('to_sub_agent_id', { length: 256 }),

    fromExternalAgentId: varchar('from_external_sub_agent_id', { length: 256 }),

    toExternalAgentId: varchar('to_external_sub_agent_id', { length: 256 }),

    fromTeamAgentId: varchar('from_team_agent_id', { length: 256 }),
    toTeamAgentId: varchar('to_team_agent_id', { length: 256 }),

    content: jsonb('content').$type<MessageContent>().notNull(),

    visibility: varchar('visibility', { length: 256 }).notNull().default('user-facing'),
    messageType: varchar('message_type', { length: 256 }).notNull().default('chat'),

    taskId: varchar('task_id', { length: 256 }),
    parentMessageId: varchar('parent_message_id', { length: 256 }),

    a2aTaskId: varchar('a2a_task_id', { length: 256 }),
    a2aSessionId: varchar('a2a_session_id', { length: 256 }),

    metadata: jsonb('metadata').$type<MessageMetadata>(),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'messages_project_fk',
    }).onDelete('cascade'),
  ]
);

export const ledgerArtifacts = pgTable(
  'ledger_artifacts',
  {
    ...projectScoped,

    taskId: varchar('task_id', { length: 256 }).notNull(),
    toolCallId: varchar('tool_call_id', { length: 256 }),
    contextId: varchar('context_id', { length: 256 }).notNull(),

    type: varchar('type', { length: 256 }).notNull().default('source'),
    name: varchar('name', { length: 256 }),
    description: text('description'),
    parts: jsonb('parts').$type<Part[] | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),

    summary: text('summary'),
    mime: jsonb('mime').$type<string[] | null>(),
    visibility: varchar('visibility', { length: 256 }).default('context'),
    allowedAgents: jsonb('allowed_agents').$type<string[] | null>(),
    derivedFrom: varchar('derived_from', { length: 256 }),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.taskId] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'ledger_artifacts_project_fk',
    }).onDelete('cascade'),
    index('ledger_artifacts_task_id_idx').on(table.taskId),
    index('ledger_artifacts_tool_call_id_idx').on(table.toolCallId),
    index('ledger_artifacts_context_id_idx').on(table.contextId),
    unique('ledger_artifacts_task_context_name_unique').on(
      table.taskId,
      table.contextId,
      table.name
    ),
  ]
);

export const apiKeys = pgTable(
  'api_keys',
  {
    ...agentScoped,
    publicId: varchar('public_id', { length: 256 }).notNull().unique(),
    keyHash: varchar('key_hash', { length: 256 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 256 }).notNull(),
    name: varchar('name', { length: 256 }),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'api_keys_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.projectId, t.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'api_keys_agent_fk',
    }).onDelete('cascade'),
    index('api_keys_tenant_agent_idx').on(t.tenantId, t.agentId),
    index('api_keys_prefix_idx').on(t.keyPrefix),
    index('api_keys_public_id_idx').on(t.publicId),
  ]
);

// Credential references for CredentialStore implementations
export const credentialReferences = pgTable(
  'credential_references',
  {
    ...projectScoped,
    name: varchar('name', { length: 256 }).notNull(),
    type: varchar('type', { length: 256 }).notNull(),
    credentialStoreId: varchar('credential_store_id', { length: 256 }).notNull(),
    retrievalParams: jsonb('retrieval_params').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'credential_references_project_fk',
    }).onDelete('cascade'),
  ]
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.tenantId, tasks.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // A task can have many parent relationships (where it's the child)
  parentRelations: many(taskRelations, {
    relationName: 'childTask',
  }),
  // A task can have many child relationships (where it's the parent)
  childRelations: many(taskRelations, {
    relationName: 'parentTask',
  }),
  subAgent: one(subAgents, {
    fields: [tasks.subAgentId],
    references: [subAgents.id],
  }),
  messages: many(messages),
  ledgerArtifacts: many(ledgerArtifacts),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  subAgents: many(subAgents),
  agents: many(agents),
  tools: many(tools),
  functions: many(functions),
  contextConfigs: many(contextConfigs),
  externalAgents: many(externalAgents),
  conversations: many(conversations),
  tasks: many(tasks),
  dataComponents: many(dataComponents),
  artifactComponents: many(artifactComponents),
  ledgerArtifacts: many(ledgerArtifacts),
  credentialReferences: many(credentialReferences),
}));

export const taskRelationsRelations = relations(taskRelations, ({ one }) => ({
  parentTask: one(tasks, {
    fields: [taskRelations.parentTaskId],
    references: [tasks.id],
    relationName: 'parentTask',
  }),
  childTask: one(tasks, {
    fields: [taskRelations.childTaskId],
    references: [tasks.id],
    relationName: 'childTask',
  }),
}));

export const contextConfigsRelations = relations(contextConfigs, ({ many, one }) => ({
  project: one(projects, {
    fields: [contextConfigs.tenantId, contextConfigs.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agents: many(agents),
  cache: many(contextCache),
}));

export const contextCacheRelations = relations(contextCache, ({ one }) => ({
  contextConfig: one(contextConfigs, {
    fields: [contextCache.contextConfigId],
    references: [contextConfigs.id],
  }),
}));

export const subAgentsRelations = relations(subAgents, ({ many, one }) => ({
  project: one(projects, {
    fields: [subAgents.tenantId, subAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  tasks: many(tasks),
  defaultForAgents: many(agents),
  sourceRelations: many(subAgentRelations, {
    relationName: 'sourceRelations',
  }),
  targetRelations: many(subAgentRelations, {
    relationName: 'targetRelations',
  }),
  sentMessages: many(messages, {
    relationName: 'sentMessages',
  }),
  receivedMessages: many(messages, {
    relationName: 'receivedMessages',
  }),
  toolRelations: many(subAgentToolRelations),
  functionToolRelations: many(subAgentFunctionToolRelations),
  dataComponentRelations: many(subAgentDataComponents),
  artifactComponentRelations: many(subAgentArtifactComponents),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  project: one(projects, {
    fields: [agents.tenantId, agents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  defaultSubAgent: one(subAgents, {
    fields: [agents.defaultSubAgentId],
    references: [subAgents.id],
  }),
  contextConfig: one(contextConfigs, {
    fields: [agents.contextConfigId],
    references: [contextConfigs.id],
  }),
  functionTools: many(functionTools),
}));

export const externalAgentsRelations = relations(externalAgents, ({ one, many }) => ({
  project: one(projects, {
    fields: [externalAgents.tenantId, externalAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  subAgentExternalAgentRelations: many(subAgentExternalAgentRelations),
  credentialReference: one(credentialReferences, {
    fields: [externalAgents.credentialReferenceId],
    references: [credentialReferences.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.tenantId, apiKeys.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agent: one(agents, {
    fields: [apiKeys.agentId],
    references: [agents.id],
  }),
}));

export const agentToolRelationsRelations = relations(subAgentToolRelations, ({ one }) => ({
  subAgent: one(subAgents, {
    fields: [subAgentToolRelations.subAgentId],
    references: [subAgents.id],
  }),
  tool: one(tools, {
    fields: [subAgentToolRelations.toolId],
    references: [tools.id],
  }),
}));

export const credentialReferencesRelations = relations(credentialReferences, ({ one, many }) => ({
  project: one(projects, {
    fields: [credentialReferences.tenantId, credentialReferences.projectId],
    references: [projects.tenantId, projects.id],
  }),
  tools: many(tools),
  externalAgents: many(externalAgents),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  project: one(projects, {
    fields: [tools.tenantId, tools.projectId],
    references: [projects.tenantId, projects.id],
  }),
  subAgentRelations: many(subAgentToolRelations),
  credentialReference: one(credentialReferences, {
    fields: [tools.credentialReferenceId],
    references: [credentialReferences.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  project: one(projects, {
    fields: [conversations.tenantId, conversations.projectId],
    references: [projects.tenantId, projects.id],
  }),
  messages: many(messages),
  activeSubAgent: one(subAgents, {
    fields: [conversations.activeSubAgentId],
    references: [subAgents.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  fromSubAgent: one(subAgents, {
    fields: [messages.fromSubAgentId],
    references: [subAgents.id],
    relationName: 'sentMessages',
  }),
  toSubAgent: one(subAgents, {
    fields: [messages.toSubAgentId],
    references: [subAgents.id],
    relationName: 'receivedMessages',
  }),
  fromTeamAgent: one(agents, {
    fields: [messages.fromTeamAgentId],
    references: [agents.id],
    relationName: 'receivedTeamMessages',
  }),
  toTeamAgent: one(agents, {
    fields: [messages.toTeamAgentId],
    references: [agents.id],
    relationName: 'sentTeamMessages',
  }),
  fromExternalAgent: one(externalAgents, {
    fields: [messages.tenantId, messages.projectId, messages.fromExternalAgentId],
    references: [externalAgents.tenantId, externalAgents.projectId, externalAgents.id],
    relationName: 'receivedExternalMessages',
  }),
  toExternalAgent: one(externalAgents, {
    fields: [messages.tenantId, messages.projectId, messages.toExternalAgentId],
    references: [externalAgents.tenantId, externalAgents.projectId, externalAgents.id],
    relationName: 'sentExternalMessages',
  }),
  task: one(tasks, {
    fields: [messages.taskId],
    references: [tasks.id],
  }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: 'parentChild',
  }),
  childMessages: many(messages, {
    relationName: 'parentChild',
  }),
}));

export const artifactComponentsRelations = relations(artifactComponents, ({ many, one }) => ({
  project: one(projects, {
    fields: [artifactComponents.tenantId, artifactComponents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  subAgentRelations: many(subAgentArtifactComponents),
}));

export const subAgentArtifactComponentsRelations = relations(
  subAgentArtifactComponents,
  ({ one }) => ({
    subAgent: one(subAgents, {
      fields: [subAgentArtifactComponents.subAgentId],
      references: [subAgents.id],
    }),
    artifactComponent: one(artifactComponents, {
      fields: [subAgentArtifactComponents.artifactComponentId],
      references: [artifactComponents.id],
    }),
  })
);

export const dataComponentsRelations = relations(dataComponents, ({ many, one }) => ({
  project: one(projects, {
    fields: [dataComponents.tenantId, dataComponents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  subAgentRelations: many(subAgentDataComponents),
}));

export const subAgentDataComponentsRelations = relations(subAgentDataComponents, ({ one }) => ({
  subAgent: one(subAgents, {
    fields: [subAgentDataComponents.subAgentId],
    references: [subAgents.id],
  }),
  dataComponent: one(dataComponents, {
    fields: [subAgentDataComponents.dataComponentId],
    references: [dataComponents.id],
  }),
}));

export const ledgerArtifactsRelations = relations(ledgerArtifacts, ({ one }) => ({
  project: one(projects, {
    fields: [ledgerArtifacts.tenantId, ledgerArtifacts.projectId],
    references: [projects.tenantId, projects.id],
  }),
  task: one(tasks, {
    fields: [ledgerArtifacts.taskId],
    references: [tasks.id],
  }),
}));

export const functionsRelations = relations(functions, ({ many, one }) => ({
  functionTools: many(functionTools),
  project: one(projects, {
    fields: [functions.tenantId, functions.projectId],
    references: [projects.tenantId, projects.id],
  }),
}));

export const subAgentRelationsRelations = relations(subAgentRelations, ({ one }) => ({
  agent: one(agents, {
    fields: [subAgentRelations.agentId],
    references: [agents.id],
  }),
  sourceSubAgent: one(subAgents, {
    fields: [subAgentRelations.sourceSubAgentId],
    references: [subAgents.id],
    relationName: 'sourceRelations',
  }),
  targetSubAgent: one(subAgents, {
    fields: [subAgentRelations.targetSubAgentId],
    references: [subAgents.id],
    relationName: 'targetRelations',
  }),
}));

// FunctionTools relations
export const functionToolsRelations = relations(functionTools, ({ one, many }) => ({
  project: one(projects, {
    fields: [functionTools.tenantId, functionTools.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agent: one(agents, {
    fields: [functionTools.tenantId, functionTools.projectId, functionTools.agentId],
    references: [agents.tenantId, agents.projectId, agents.id],
  }),
  function: one(functions, {
    fields: [functionTools.tenantId, functionTools.projectId, functionTools.functionId],
    references: [functions.tenantId, functions.projectId, functions.id],
  }),
  subAgentRelations: many(subAgentFunctionToolRelations),
}));

// SubAgentFunctionToolRelations relations
export const subAgentFunctionToolRelationsRelations = relations(
  subAgentFunctionToolRelations,
  ({ one }) => ({
    subAgent: one(subAgents, {
      fields: [subAgentFunctionToolRelations.subAgentId],
      references: [subAgents.id],
    }),
    functionTool: one(functionTools, {
      fields: [subAgentFunctionToolRelations.functionToolId],
      references: [functionTools.id],
    }),
  })
);

// SubAgentExternalAgentRelations relations
export const subAgentExternalAgentRelationsRelations = relations(
  subAgentExternalAgentRelations,
  ({ one }) => ({
    subAgent: one(subAgents, {
      fields: [
        subAgentExternalAgentRelations.tenantId,
        subAgentExternalAgentRelations.projectId,
        subAgentExternalAgentRelations.agentId,
        subAgentExternalAgentRelations.subAgentId,
      ],
      references: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
    }),
    externalAgent: one(externalAgents, {
      fields: [
        subAgentExternalAgentRelations.tenantId,
        subAgentExternalAgentRelations.projectId,
        subAgentExternalAgentRelations.externalAgentId,
      ],
      references: [externalAgents.tenantId, externalAgents.projectId, externalAgents.id],
    }),
  })
);

export const subAgentTeamAgentRelationsRelations = relations(
  subAgentTeamAgentRelations,
  ({ one }) => ({
    subAgent: one(subAgents, {
      fields: [
        subAgentTeamAgentRelations.tenantId,
        subAgentTeamAgentRelations.projectId,
        subAgentTeamAgentRelations.agentId,
        subAgentTeamAgentRelations.subAgentId,
      ],
      references: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
    }),
    targetAgent: one(agents, {
      fields: [
        subAgentTeamAgentRelations.tenantId,
        subAgentTeamAgentRelations.projectId,
        subAgentTeamAgentRelations.targetAgentId,
      ],
      references: [agents.tenantId, agents.projectId, agents.id],
    }),
  })
);
