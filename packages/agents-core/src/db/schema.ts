import { relations, sql } from 'drizzle-orm';
import {
  blob,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
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
  tenantId: text('tenant_id').notNull(),
  id: text('id').notNull(),
};

const projectScoped = {
  ...tenantScoped,
  projectId: text('project_id').notNull(),
};

const agentScoped = {
  ...projectScoped,
  agentId: text('agent_id').notNull(),
};

const subAgentScoped = {
  ...agentScoped,
  subAgentId: text('sub_agent_id').notNull(),
};

const uiProperties = {
  name: text('name').notNull(),
  description: text('description').notNull(),
};

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const projects = sqliteTable(
  'projects',
  {
    ...tenantScoped,
    ...uiProperties,

    models: text('models', { mode: 'json' }).$type<ProjectModels>(),

    stopWhen: text('stop_when', { mode: 'json' }).$type<StopWhen>(),

    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

export const agents = sqliteTable(
  'agent',
  {
    ...projectScoped,
    name: text('name').notNull(),
    description: text('description'),
    defaultSubAgentId: text('default_sub_agent_id'),
    contextConfigId: text('context_config_id'),
    models: text('models', { mode: 'json' }).$type<Models>(),
    statusUpdates: text('status_updates', { mode: 'json' }).$type<StatusUpdateSettings>(),
    prompt: text('prompt'),
    stopWhen: text('stop_when', { mode: 'json' }).$type<AgentStopWhen>(),
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

export const contextConfigs = sqliteTable(
  'context_configs',
  {
    ...agentScoped,

    headersSchema: blob('headers_schema', { mode: 'json' }).$type<unknown>(),

    contextVariables: blob('context_variables', { mode: 'json' }).$type<
      Record<string, ContextFetchDefinition>
    >(),

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

export const contextCache = sqliteTable(
  'context_cache',
  {
    ...projectScoped,

    conversationId: text('conversation_id').notNull(),

    contextConfigId: text('context_config_id').notNull(),
    contextVariableKey: text('context_variable_key').notNull(),
    value: blob('value', { mode: 'json' }).$type<unknown>().notNull(),

    requestHash: text('request_hash'),

    fetchedAt: text('fetched_at').notNull(),
    fetchSource: text('fetch_source'),
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

export const subAgents = sqliteTable(
  'sub_agents',
  {
    ...agentScoped,
    ...uiProperties,
    prompt: text('prompt').notNull(),
    conversationHistoryConfig: text('conversation_history_config', {
      mode: 'json',
    }).$type<ConversationHistoryConfig>(),
    models: text('models', { mode: 'json' }).$type<Models>(),
    stopWhen: text('stop_when', { mode: 'json' }).$type<SubAgentStopWhen>(),
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

export const subAgentRelations = sqliteTable(
  'sub_agent_relations',
  {
    ...agentScoped,
    sourceSubAgentId: text('source_sub_agent_id').notNull(),
    targetSubAgentId: text('target_sub_agent_id'),
    relationType: text('relation_type'),
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

export const teamAgents = sqliteTable(
  'team_agents',
  {
    ...agentScoped,
    originAgentId: text('origin_agent_id').notNull(),
    originProjectId: text('origin_project_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'team_agents_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.originProjectId, table.originAgentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'team_agents_origin_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const externalAgents = sqliteTable(
  'external_agents',
  {
    ...projectScoped,
    ...uiProperties,
    baseUrl: text('base_url').notNull(),
    credentialReferenceId: text('credential_reference_id'),
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
    }).onDelete('set null'),
  ]
);

export const tasks = sqliteTable(
  'tasks',
  {
    ...subAgentScoped,
    contextId: text('context_id').notNull(),
    status: text('status').notNull(),
    metadata: blob('metadata', { mode: 'json' }).$type<TaskMetadataConfig>(),
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

export const taskRelations = sqliteTable(
  'task_relations',
  {
    ...projectScoped,
    parentTaskId: text('parent_task_id').notNull(),
    childTaskId: text('child_task_id').notNull(),
    relationType: text('relation_type').default('parent_child'),
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

export const dataComponents = sqliteTable(
  'data_components',
  {
    ...projectScoped,
    ...uiProperties,
    props: blob('props', { mode: 'json' }).$type<Record<string, unknown>>(),
    preview: blob('preview', { mode: 'json' }).$type<{
      code: string;
      data: Record<string, unknown>;
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

export const subAgentDataComponents = sqliteTable(
  'sub_agent_data_components',
  {
    ...subAgentScoped,
    dataComponentId: text('data_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const artifactComponents = sqliteTable(
  'artifact_components',
  {
    ...projectScoped,
    ...uiProperties,
    props: blob('props', { mode: 'json' }).$type<Record<string, unknown>>(),
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

export const subAgentArtifactComponents = sqliteTable(
  'sub_agent_artifact_components',
  {
    ...subAgentScoped,
    artifactComponentId: text('artifact_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId, table.id],
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

export const tools = sqliteTable(
  'tools',
  {
    ...projectScoped,
    name: text('name').notNull(),
    description: text('description'),

    config: blob('config', { mode: 'json' })
      .$type<{
        type: 'mcp';
        mcp: ToolMcpConfig;
      }>()
      .notNull(),

    credentialReferenceId: text('credential_reference_id'),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string>>(),

    imageUrl: text('image_url'),

    capabilities: blob('capabilities', { mode: 'json' }).$type<ToolServerCapabilities>(),

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

export const functionTools = sqliteTable(
  'function_tools',
  {
    ...agentScoped,
    name: text('name').notNull(),
    description: text('description'),
    functionId: text('function_id').notNull(),
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

export const functions = sqliteTable(
  'functions',
  {
    ...projectScoped,
    inputSchema: blob('input_schema', { mode: 'json' }).$type<Record<string, unknown>>(),
    executeCode: text('execute_code').notNull(),
    dependencies: blob('dependencies', { mode: 'json' }).$type<Record<string, string>>(),
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

export const subAgentToolRelations = sqliteTable(
  'sub_agent_tool_relations',
  {
    ...subAgentScoped,
    toolId: text('tool_id').notNull(),
    selectedTools: blob('selected_tools', { mode: 'json' }).$type<string[] | null>(),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string> | null>(),
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

export const subAgentExternalAgentRelations = sqliteTable(
  'sub_agent_external_agent_relations',
  {
    ...subAgentScoped,
    externalAgentId: text('external_agent_id').notNull(),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
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

export const subAgentFunctionToolRelations = sqliteTable(
  'sub_agent_function_tool_relations',
  {
    ...subAgentScoped,
    functionToolId: text('function_tool_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
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

export const conversations = sqliteTable(
  'conversations',
  {
    ...projectScoped,
    userId: text('user_id'),
    activeSubAgentId: text('active_sub_agent_id').notNull(),
    title: text('title'),
    lastContextResolution: text('last_context_resolution'),
    metadata: blob('metadata', { mode: 'json' }).$type<ConversationMetadata>(),
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

export const messages = sqliteTable(
  'messages',
  {
    ...projectScoped,
    conversationId: text('conversation_id').notNull(),

    role: text('role').notNull(),

    fromSubAgentId: text('from_sub_agent_id'),
    toSubAgentId: text('to_sub_agent_id'),

    fromExternalAgentId: text('from_external_sub_agent_id'),

    toExternalAgentId: text('to_external_sub_agent_id'),

    fromTeamAgentId: text('from_team_agent_id'),
    toTeamAgentId: text('to_team_agent_id'),

    content: blob('content', { mode: 'json' }).$type<MessageContent>().notNull(),

    visibility: text('visibility').notNull().default('user-facing'),
    messageType: text('message_type').notNull().default('chat'),

    taskId: text('task_id'),
    parentMessageId: text('parent_message_id'),

    a2aTaskId: text('a2a_task_id'),
    a2aSessionId: text('a2a_session_id'),

    metadata: blob('metadata', { mode: 'json' }).$type<MessageMetadata>(),

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

export const ledgerArtifacts = sqliteTable(
  'ledger_artifacts',
  {
    ...projectScoped,

    taskId: text('task_id').notNull(),
    toolCallId: text('tool_call_id'),
    contextId: text('context_id').notNull(),

    type: text('type').notNull().default('source'),
    name: text('name'),
    description: text('description'),
    parts: blob('parts', { mode: 'json' }).$type<Part[] | null>(),
    metadata: blob('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),

    summary: text('summary'),
    mime: blob('mime', { mode: 'json' }).$type<string[] | null>(),
    visibility: text('visibility').default('context'),
    allowedAgents: blob('allowed_agents', { mode: 'json' }).$type<string[] | null>(),
    derivedFrom: text('derived_from'),

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

export const apiKeys = sqliteTable(
  'api_keys',
  {
    ...agentScoped,
    publicId: text('public_id').notNull().unique(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    name: text('name'),
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at'),
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
export const credentialReferences = sqliteTable(
  'credential_references',
  {
    ...projectScoped,
    type: text('type').notNull(),
    credentialStoreId: text('credential_store_id').notNull(),
    retrievalParams: blob('retrieval_params', { mode: 'json' }).$type<Record<string, unknown>>(),
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
  teamAgents: many(teamAgents),
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

export const teamAgentsRelations = relations(teamAgents, ({ one, many }) => ({
  project: one(projects, {
    fields: [teamAgents.tenantId, teamAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agent: one(agents, {
    fields: [teamAgents.tenantId, teamAgents.projectId, teamAgents.agentId],
    references: [agents.tenantId, agents.projectId, agents.id],
  }),
  originAgent: one(agents, {
    fields: [teamAgents.tenantId, teamAgents.originProjectId, teamAgents.originAgentId],
    references: [agents.tenantId, agents.projectId, agents.id],
    relationName: 'originAgentRelation',
  }),
  subAgentRelations: many(subAgentRelations),
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
  fromTeamAgent: one(teamAgents, {
    fields: [messages.fromTeamAgentId],
    references: [teamAgents.id],
    relationName: 'receivedTeamMessages',
  }),
  toTeamAgent: one(teamAgents, {
    fields: [messages.toTeamAgentId],
    references: [teamAgents.id],
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
