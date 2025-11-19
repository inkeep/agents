import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
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
  Filter,
  MessageContent,
  MessageMetadata,
  Models,
  PassCriteria,
  ProjectModels,
  StatusUpdateSettings,
  TaskMetadataConfig,
  ToolMcpConfig,
  ToolServerCapabilities,
} from '../types/utility';
import type {
  AgentStopWhen,
  ModelSettings,
  StopWhen,
  SubAgentStopWhen,
} from '../validation/schemas';

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
    toolPolicies: jsonb('tool_policies').$type<Record<
      string,
      { needsApproval?: boolean }
    > | null>(),
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

export const subAgentTeamAgentRelations = pgTable(
  'sub_agent_team_agent_relations',
  {
    ...subAgentScoped,
    targetAgentId: varchar('target_agent_id', { length: 256 }).notNull(),
    headers: jsonb('headers').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
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

/**
/**
 * Dataset table (CONFIG LAYER)
 * 
 * A collection of test cases/items used for evaluation. Contains dataset items
 * that define input/output pairs for testing agents. Used for batch evaluation
 * runs where conversations are created from dataset items. Each datasetRun
 * specifies which agent to use when executing the dataset.
 * 
 * one to many relationship with datasetItem
 * 
 * Includes: name, description, and timestamps
 */
export const dataset = pgTable(
  'dataset',
  {
    ...projectScoped,
    ...uiProperties,
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'dataset_project_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Dataset Item table (CONFIG LAYER)
 *
 * Individual test case within a dataset. Contains the input messages to send
 * to an agent and optionally expected output or simulation configuration.
 * When a dataset run executes, it creates conversations from these items.
 *
 *
 * Includes: input (messages array with optional headers), expected output (array of messages),
 * simulation agent (stopWhen conditions, prompt/modelConfig), and timestamps
 * simulationAgent is for when a user wants to create a multi-turn simulation aka a simulating agent is creating input messages based on a persona
 */
export const datasetItem = pgTable(
  'dataset_item',
  {
    ...projectScoped,
    datasetId: text('dataset_id').notNull(),
    input: jsonb('input')
      .$type<{
        messages: Array<{ role: string; content: MessageContent }>;
        headers?: Record<string, string>;
      }>()
      .notNull(),
    expectedOutput:
      jsonb('expected_output').$type<Array<{ role: string; content: MessageContent }>>(),
    simulationAgent: jsonb('simulation_agent').$type<{
      stopWhen?: StopWhen;
      prompt: string;
      model: ModelSettings;
    }>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetId],
      foreignColumns: [dataset.tenantId, dataset.projectId, dataset.id],
      name: 'dataset_item_dataset_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluator table (CONFIG LAYER)
 *
 * Contains
 * the prompt/instructions for the evaluator, output schema for structured
 * results, and model configuration.
 *
 * Includes: name, description, prompt, schema (output structure),
 * model (required model config for the evaluator LLM), and timestamps
 */
export const evaluator = pgTable(
  'evaluator',
  {
    ...projectScoped,
    ...uiProperties,
    prompt: text('prompt').notNull(),
    schema: jsonb('schema').$type<Record<string, unknown>>().notNull(),
    model: jsonb('model').$type<ModelSettings>().notNull(),
    passCriteria: jsonb('pass_criteria').$type<PassCriteria>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'evaluator_project_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Dataset Run Config table (CONFIG LAYER)
 *
 * Holds the config for running datasets (datasetId).
 * Join table with agents (many-to-many).
 *
 * Example: "Run weekly with agent X against dataset Y"
 * Run (and evaluate) after every change to agent X.
 *
 * If you want to also run the evals, link to evaluationRunConfig via join table.
 *
 * one to many relationship with datasetRun
 * many to many relationship with agents (via join table)
 * many to many relationship with evaluationRunConfig (via join table)
 *
 * Includes: name, description, datasetId (which dataset to run), and timestamps
 */
export const datasetRunConfig = pgTable(
  'dataset_run_config',
  {
    ...projectScoped,
    ...uiProperties,
    datasetId: text('dataset_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'dataset_run_config_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetId],
      foreignColumns: [dataset.tenantId, dataset.projectId, dataset.id],
      name: 'dataset_run_config_dataset_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Dataset Run Config Agent Relations join table (CONFIG LAYER)
 *
 * Links agents to dataset run configs. Many-to-many relationship that
 * allows one dataset run config to use multiple agents, and one agent to be used
 * by multiple dataset run configs.
 *
 * Includes: datasetRunConfigId, agentId, and timestamps
 */
export const datasetRunConfigAgentRelations = pgTable(
  'dataset_run_config_agent_relations',
  {
    ...projectScoped,
    datasetRunConfigId: text('dataset_run_config_id').notNull(),
    agentId: text('agent_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetRunConfigId],
      foreignColumns: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
      name: 'dataset_run_config_agent_relations_dataset_run_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'dataset_run_config_agent_relations_agent_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Dataset Run Config Evaluation Run Config Relations join table (CONFIG LAYER)
 *
 * Links dataset run configs to evaluation run configs. Many-to-many relationship that
 * allows one dataset run config to trigger multiple evaluation runs, and one evaluation
 * run config to be triggered by multiple dataset run configs.
 *
 * When a datasetRun completes, it can trigger evaluations using the linked evaluation run configs.
 * The `enabled` field controls whether this specific evaluation run config should be triggered.
 *
 * Includes: datasetRunConfigId, evaluationRunConfigId, enabled (defaults to true), and timestamps
 */
export const datasetRunConfigEvaluationRunConfigRelations = pgTable(
  'dataset_run_config_evaluation_run_config_relations',
  {
    ...projectScoped,
    datasetRunConfigId: text('dataset_run_config_id').notNull(),
    evaluationRunConfigId: text('evaluation_run_config_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetRunConfigId],
      foreignColumns: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
      name: 'dataset_run_config_evaluation_run_config_relations_dataset_run_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationRunConfigId],
      foreignColumns: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
      name: 'dataset_run_config_evaluation_run_config_relations_evaluation_run_config_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Dataset Run table (RUNTIME STORAGE)
 *
 * Execution of a suite of items from a dataset. Represents a batch run that
 * processes dataset items and creates conversations (basically a batch run of conversations). Tracks the execution
 * status and links to conversations created during the run via
 * datasetRunConversationRelations join table.
 *
 * When evaluators are specified, an evaluation job is automatically created after the run completes,
 * and the evaluationJobConfigId links to that job.
 *
 * Includes: datasetId (which dataset to run),
 * datasetRunConfigId (required: always created from a config),
 * evaluationJobConfigId (optional: links to evaluation job created for this run), and timestamps
 */
export const datasetRun = pgTable(
  'dataset_run',
  {
    ...projectScoped,
    datasetId: text('dataset_id').notNull(),
    datasetRunConfigId: text('dataset_run_config_id').notNull(),
    evaluationJobConfigId: text('evaluation_job_config_id'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetId],
      foreignColumns: [dataset.tenantId, dataset.projectId, dataset.id],
      name: 'dataset_run_dataset_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetRunConfigId],
      foreignColumns: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
      name: 'dataset_run_dataset_run_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationJobConfigId],
      foreignColumns: [
        evaluationJobConfig.tenantId,
        evaluationJobConfig.projectId,
        evaluationJobConfig.id,
      ],
      name: 'dataset_run_evaluation_job_config_fk',
    }).onDelete('set null'),
  ]
);

/**
 * Dataset Run Conversation Relations join table (RUNTIME STORAGE)
 *
 * Links conversations created during a dataset run execution. One-to-many
 * relationship where one datasetRun can create many conversations, but each
 * conversation belongs to exactly one datasetRun. Used to track which
 * conversations were generated from which dataset run.
 *
 * Includes: datasetRunId (composite FK to datasetRun), conversationId (composite FK to conversations),
 * datasetItemId (composite FK to datasetItem) to directly link conversations to their source dataset items,
 * unique constraint on (datasetRunId, conversationId) ensures one conversation per datasetRun,
 * and timestamps
 */
export const datasetRunConversationRelations = pgTable(
  'dataset_run_conversation_relations',
  {
    ...projectScoped,
    datasetRunId: text('dataset_run_id').notNull(),
    conversationId: text('conversation_id').notNull(),
    datasetItemId: text('dataset_item_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetRunId],
      foreignColumns: [datasetRun.tenantId, datasetRun.projectId, datasetRun.id],
      name: 'dataset_run_conversation_relations_run_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'dataset_run_conversation_relations_conversation_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.datasetItemId],
      foreignColumns: [datasetItem.tenantId, datasetItem.projectId, datasetItem.id],
      name: 'dataset_run_conversation_relations_item_fk',
    }).onDelete('cascade'),
    unique('dataset_run_conversation_relations_unique').on(
      table.datasetRunId,
      table.conversationId
    ),
  ]
);

/**
 * Evaluation Suite Config table (CONFIG LAYER)
 *
 * Configuration that defines what to evaluate. Contains filters and evaluators.
 * Example: "Evaluate conversations for agentId X with filters Y"
 *
 * Linked to one or more evaluationRunConfigs (via join table) that define when to run.
 * When triggered, creates an evaluationRun with computed filters based on the criteria.
 *
 * Configuration-level filters:
 * - Filters stored in filters JSONB field
 *
 * many to many relationship with evaluationRunConfig
 *
 * Includes: name, description, filters (JSONB for evaluation criteria),
 * sampleRate for sampling, and timestamps
 */
type EvaluationSuiteFilterCriteria = {
  agentIds?: string[];
  [key: string]: unknown;
};

export const evaluationSuiteConfig = pgTable(
  'evaluation_suite_config',
  {
    ...projectScoped,
    ...uiProperties,
    filters: jsonb('filters').$type<Filter<EvaluationSuiteFilterCriteria>>(), // Filters for the evaluation suite (supports and/or operations)
    sampleRate: doublePrecision('sample_rate'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'evaluation_suite_config_project_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Suite Config Evaluator Relations join table (CONFIG LAYER)
 *
 * Links evaluators to evaluation suite configs. Many-to-many relationship that
 * attaches evaluators to an evaluation suite configuration. Each evaluator must
 * have its own model configuration defined.
 *
 * Includes: evaluationSuiteConfigId, evaluatorId, and timestamps
 */
export const evaluationSuiteConfigEvaluatorRelations = pgTable(
  'evaluation_suite_config_evaluator_relations',
  {
    ...projectScoped,
    evaluationSuiteConfigId: text('evaluation_suite_config_id').notNull(),
    evaluatorId: text('evaluator_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationSuiteConfigId],
      foreignColumns: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
      name: 'evaluation_suite_config_evaluator_relations_evaluation_suite_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluatorId],
      foreignColumns: [evaluator.tenantId, evaluator.projectId, evaluator.id],
      name: 'evaluation_suite_config_evaluator_relations_evaluator_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Run Config table (CONFIG LAYER)
 *
 * Configuration for automated evaluation runs. Trigger policies is conversation end.
 * Can be linked to multiple evaluation suite configs via join table.
 * many to many relationship with evaluationSuiteConfig
 *
 * Evaluations are automatically triggered when regular conversations complete.
 * When a conversation ends, creates an evaluationRun that evaluates that conversation.
 *
 * NOTE: Evaluation run configs ONLY run on regular conversations, NOT dataset run conversations.
 * Dataset runs create their own evaluationJobConfig with specific evaluators at run-time.
 *
 * one to many relationship with evaluationRun
 */
export const evaluationRunConfig = pgTable(
  'evaluation_run_config',
  {
    ...projectScoped,
    ...uiProperties,
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'evaluation_run_config_project_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Run Config Evaluation Suite Config Relations join table (CONFIG LAYER)
 *
 * Links evaluation run configs to evaluation suite configs. Many-to-many relationship that
 * allows one suite config to have multiple run schedules, and one run config to be used
 * by multiple suite configs.
 *
 * Includes: evaluationRunConfigId, evaluationSuiteConfigId, and timestamps
 */
export const evaluationRunConfigEvaluationSuiteConfigRelations = pgTable(
  'evaluation_run_config_evaluation_suite_config_relations',
  {
    ...projectScoped,
    evaluationRunConfigId: text('evaluation_run_config_id').notNull(),
    evaluationSuiteConfigId: text('evaluation_suite_config_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationRunConfigId],
      foreignColumns: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
      name: 'eval_run_config_eval_suite_rel_run_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationSuiteConfigId],
      foreignColumns: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
      name: 'eval_run_config_eval_suite_rel_suite_config_fk',
    }).onDelete('cascade'),
  ]
);

type EvaluationJobFilterCriteria = {
  datasetRunIds?: string[];
  conversationIds?: string[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  [key: string]: unknown;
};
/**
 * Evaluation Job Config table (CONFIG LAYER)
 *
 * Configuration for a one-off evaluation job to be executed.
 * Example: "Evaluate all conversations in datasetRunId 1234"
 *
 * Created manually or by external systems. Contains job-specific filters like
 * datasetRunIds, conversationIds, and absolute dateRange.
 *
 * one to many relationship with evaluationRun
 *
 * When a job completes, an evaluationRun is created with evaluationJobConfigId set.
 *
 * Includes: jobFilters (specific filters for this job execution: datasetRunIds, conversationIds,
 * dateRange with absolute dates), and timestamps
 */
export const evaluationJobConfig = pgTable(
  'evaluation_job_config',
  {
    ...projectScoped,
    jobFilters: jsonb('job_filters').$type<Filter<EvaluationJobFilterCriteria>>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'evaluation_job_config_project_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Job Config Evaluator Relations join table (CONFIG LAYER)
 *
 * Links evaluators to evaluation job configs. Many-to-many relationship that
 * attaches evaluators to an evaluation job configuration. Each evaluator must
 * have its own model configuration defined.
 *
 * Includes: evaluationJobConfigId, evaluatorId, and timestamps
 */
export const evaluationJobConfigEvaluatorRelations = pgTable(
  'evaluation_job_config_evaluator_relations',
  {
    ...projectScoped,
    evaluationJobConfigId: text('evaluation_job_config_id').notNull(),
    evaluatorId: text('evaluator_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationJobConfigId],
      foreignColumns: [
        evaluationJobConfig.tenantId,
        evaluationJobConfig.projectId,
        evaluationJobConfig.id,
      ],
      name: 'evaluation_job_config_evaluator_relations_evaluation_job_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluatorId],
      foreignColumns: [evaluator.tenantId, evaluator.projectId, evaluator.id],
      name: 'evaluation_job_config_evaluator_relations_evaluator_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Run table (RUNTIME STORAGE)
 *
 * Record created when an evaluation job config or evaluation run config is triggered.
 * Represents a completed evaluation run. Links to the evaluationJobConfig (if created from a job)
 * or evaluationRunConfig (if created from a run config).
 * Results are stored in evaluationResult table.
 * one to many relationship with evaluationResult
 *
 * Includes: evaluationJobConfigId (optional: if created from a job),
 * evaluationRunConfigId (optional: if created from a run config),
 * and timestamps
 */
export const evaluationRun = pgTable(
  'evaluation_run',
  {
    ...projectScoped,
    evaluationJobConfigId: text('evaluation_job_config_id'), // Optional: if created from a job
    evaluationRunConfigId: text('evaluation_run_config_id'), // Optional: if created from a run config
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationJobConfigId],
      foreignColumns: [
        evaluationJobConfig.tenantId,
        evaluationJobConfig.projectId,
        evaluationJobConfig.id,
      ],
      name: 'evaluation_run_evaluation_job_config_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationRunConfigId],
      foreignColumns: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
      name: 'evaluation_run_evaluation_run_config_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Evaluation Result table (RUNTIME STORAGE)
 *
 * Stores the result of evaluating a conversation with a specific evaluator.
 * Contains the evaluation output. Linked to an evaluation run.
 * Each result represents one evaluator's assessment of one conversation.
 *
 * Includes: conversationId (required), evaluatorId (required),
 * evaluationRunId (optional, links to evaluationRun),
 * output (evaluation result as MessageContent), and timestamps
 */
export const evaluationResult = pgTable(
  'evaluation_result',
  {
    ...projectScoped,
    conversationId: text('conversation_id').notNull(),
    evaluatorId: text('evaluator_id').notNull(),
    evaluationRunId: text('evaluation_run_id'),
    output: jsonb('output').$type<MessageContent>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'evaluation_result_conversation_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluatorId],
      foreignColumns: [evaluator.tenantId, evaluator.projectId, evaluator.id],
      name: 'evaluation_result_evaluator_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationRunId],
      foreignColumns: [evaluationRun.tenantId, evaluationRun.projectId, evaluationRun.id],
      name: 'evaluation_result_evaluation_run_fk',
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
  datasets: many(dataset),
  evaluators: many(evaluator),
  evaluationSuiteConfigs: many(evaluationSuiteConfig),
  datasetRunConfigs: many(datasetRunConfig),
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

export const datasetRelations = relations(dataset, ({ one, many }) => ({
  project: one(projects, {
    fields: [dataset.tenantId, dataset.projectId],
    references: [projects.tenantId, projects.id],
  }),
  items: many(datasetItem),
  datasetRuns: many(datasetRun),
}));

export const datasetItemRelations = relations(datasetItem, ({ one }) => ({
  dataset: one(dataset, {
    fields: [datasetItem.tenantId, datasetItem.projectId, datasetItem.datasetId],
    references: [dataset.tenantId, dataset.projectId, dataset.id],
  }),
}));

export const evaluatorRelations = relations(evaluator, ({ one, many }) => ({
  project: one(projects, {
    fields: [evaluator.tenantId, evaluator.projectId],
    references: [projects.tenantId, projects.id],
  }),
  evaluationResults: many(evaluationResult),
  evaluationSuiteConfigs: many(evaluationSuiteConfigEvaluatorRelations),
  evaluationJobConfigs: many(evaluationJobConfigEvaluatorRelations),
}));

export const datasetRunConfigRelations = relations(datasetRunConfig, ({ one, many }) => ({
  project: one(projects, {
    fields: [datasetRunConfig.tenantId, datasetRunConfig.projectId],
    references: [projects.tenantId, projects.id],
  }),
  dataset: one(dataset, {
    fields: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.datasetId],
    references: [dataset.tenantId, dataset.projectId, dataset.id],
  }),
  agents: many(datasetRunConfigAgentRelations),
  evaluationRunConfigs: many(datasetRunConfigEvaluationRunConfigRelations),
  runs: many(datasetRun),
}));

export const datasetRunConfigAgentRelationsRelations = relations(
  datasetRunConfigAgentRelations,
  ({ one }) => ({
    datasetRunConfig: one(datasetRunConfig, {
      fields: [
        datasetRunConfigAgentRelations.tenantId,
        datasetRunConfigAgentRelations.projectId,
        datasetRunConfigAgentRelations.datasetRunConfigId,
      ],
      references: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
    }),
    agent: one(agents, {
      fields: [
        datasetRunConfigAgentRelations.tenantId,
        datasetRunConfigAgentRelations.projectId,
        datasetRunConfigAgentRelations.agentId,
      ],
      references: [agents.tenantId, agents.projectId, agents.id],
    }),
  })
);

export const datasetRunConfigEvaluationRunConfigRelationsRelations = relations(
  datasetRunConfigEvaluationRunConfigRelations,
  ({ one }) => ({
    datasetRunConfig: one(datasetRunConfig, {
      fields: [
        datasetRunConfigEvaluationRunConfigRelations.tenantId,
        datasetRunConfigEvaluationRunConfigRelations.projectId,
        datasetRunConfigEvaluationRunConfigRelations.datasetRunConfigId,
      ],
      references: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
    }),
    evaluationRunConfig: one(evaluationRunConfig, {
      fields: [
        datasetRunConfigEvaluationRunConfigRelations.tenantId,
        datasetRunConfigEvaluationRunConfigRelations.projectId,
        datasetRunConfigEvaluationRunConfigRelations.evaluationRunConfigId,
      ],
      references: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
    }),
  })
);

export const datasetRunRelations = relations(datasetRun, ({ one, many }) => ({
  dataset: one(dataset, {
    fields: [datasetRun.tenantId, datasetRun.projectId, datasetRun.datasetId],
    references: [dataset.tenantId, dataset.projectId, dataset.id],
  }),
  datasetRunConfig: one(datasetRunConfig, {
    fields: [datasetRun.tenantId, datasetRun.projectId, datasetRun.datasetRunConfigId],
    references: [datasetRunConfig.tenantId, datasetRunConfig.projectId, datasetRunConfig.id],
  }),
  conversations: many(datasetRunConversationRelations),
}));

export const evaluationSuiteConfigRelations = relations(evaluationSuiteConfig, ({ one, many }) => ({
  project: one(projects, {
    fields: [evaluationSuiteConfig.tenantId, evaluationSuiteConfig.projectId],
    references: [projects.tenantId, projects.id],
  }),
  runConfigs: many(evaluationRunConfigEvaluationSuiteConfigRelations),
  evaluators: many(evaluationSuiteConfigEvaluatorRelations),
}));

export const evaluationSuiteConfigEvaluatorRelationsRelations = relations(
  evaluationSuiteConfigEvaluatorRelations,
  ({ one }) => ({
    evaluationSuiteConfig: one(evaluationSuiteConfig, {
      fields: [
        evaluationSuiteConfigEvaluatorRelations.tenantId,
        evaluationSuiteConfigEvaluatorRelations.projectId,
        evaluationSuiteConfigEvaluatorRelations.evaluationSuiteConfigId,
      ],
      references: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
    }),
    evaluator: one(evaluator, {
      fields: [
        evaluationSuiteConfigEvaluatorRelations.tenantId,
        evaluationSuiteConfigEvaluatorRelations.projectId,
        evaluationSuiteConfigEvaluatorRelations.evaluatorId,
      ],
      references: [evaluator.tenantId, evaluator.projectId, evaluator.id],
    }),
  })
);

export const evaluationJobConfigEvaluatorRelationsRelations = relations(
  evaluationJobConfigEvaluatorRelations,
  ({ one }) => ({
    evaluationJobConfig: one(evaluationJobConfig, {
      fields: [
        evaluationJobConfigEvaluatorRelations.tenantId,
        evaluationJobConfigEvaluatorRelations.projectId,
        evaluationJobConfigEvaluatorRelations.evaluationJobConfigId,
      ],
      references: [
        evaluationJobConfig.tenantId,
        evaluationJobConfig.projectId,
        evaluationJobConfig.id,
      ],
    }),
    evaluator: one(evaluator, {
      fields: [
        evaluationJobConfigEvaluatorRelations.tenantId,
        evaluationJobConfigEvaluatorRelations.projectId,
        evaluationJobConfigEvaluatorRelations.evaluatorId,
      ],
      references: [evaluator.tenantId, evaluator.projectId, evaluator.id],
    }),
  })
);

export const evaluationJobConfigRelations = relations(evaluationJobConfig, ({ one, many }) => ({
  project: one(projects, {
    fields: [evaluationJobConfig.tenantId, evaluationJobConfig.projectId],
    references: [projects.tenantId, projects.id],
  }),
  run: one(evaluationRun, {
    fields: [evaluationJobConfig.tenantId, evaluationJobConfig.projectId, evaluationJobConfig.id],
    references: [
      evaluationRun.tenantId,
      evaluationRun.projectId,
      evaluationRun.evaluationJobConfigId,
    ],
  }),
  evaluators: many(evaluationJobConfigEvaluatorRelations),
}));

export const evaluationRunConfigEvaluationSuiteConfigRelationsRelations = relations(
  evaluationRunConfigEvaluationSuiteConfigRelations,
  ({ one }) => ({
    evaluationRunConfig: one(evaluationRunConfig, {
      fields: [
        evaluationRunConfigEvaluationSuiteConfigRelations.tenantId,
        evaluationRunConfigEvaluationSuiteConfigRelations.projectId,
        evaluationRunConfigEvaluationSuiteConfigRelations.evaluationRunConfigId,
      ],
      references: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
    }),
    evaluationSuiteConfig: one(evaluationSuiteConfig, {
      fields: [
        evaluationRunConfigEvaluationSuiteConfigRelations.tenantId,
        evaluationRunConfigEvaluationSuiteConfigRelations.projectId,
        evaluationRunConfigEvaluationSuiteConfigRelations.evaluationSuiteConfigId,
      ],
      references: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
    }),
  })
);

export const evaluationRunConfigRelations = relations(evaluationRunConfig, ({ one, many }) => ({
  project: one(projects, {
    fields: [evaluationRunConfig.tenantId, evaluationRunConfig.projectId],
    references: [projects.tenantId, projects.id],
  }),
  suiteConfigs: many(evaluationRunConfigEvaluationSuiteConfigRelations),
  datasetRunConfigs: many(datasetRunConfigEvaluationRunConfigRelations),
  runs: many(evaluationRun),
}));

export const evaluationRunRelations = relations(evaluationRun, ({ one, many }) => ({
  evaluationJobConfig: one(evaluationJobConfig, {
    fields: [evaluationRun.tenantId, evaluationRun.projectId, evaluationRun.evaluationJobConfigId],
    references: [
      evaluationJobConfig.tenantId,
      evaluationJobConfig.projectId,
      evaluationJobConfig.id,
    ],
  }),
  evaluationRunConfig: one(evaluationRunConfig, {
    fields: [evaluationRun.tenantId, evaluationRun.projectId, evaluationRun.evaluationRunConfigId],
    references: [
      evaluationRunConfig.tenantId,
      evaluationRunConfig.projectId,
      evaluationRunConfig.id,
    ],
  }),
  results: many(evaluationResult),
}));

export const evaluationResultRelations = relations(evaluationResult, ({ one }) => ({
  conversation: one(conversations, {
    fields: [
      evaluationResult.tenantId,
      evaluationResult.projectId,
      evaluationResult.conversationId,
    ],
    references: [conversations.tenantId, conversations.projectId, conversations.id],
    relationName: 'conversationEvaluationResults',
  }),
  evaluator: one(evaluator, {
    fields: [evaluationResult.tenantId, evaluationResult.projectId, evaluationResult.evaluatorId],
    references: [evaluator.tenantId, evaluator.projectId, evaluator.id],
  }),
  evaluationRun: one(evaluationRun, {
    fields: [
      evaluationResult.tenantId,
      evaluationResult.projectId,
      evaluationResult.evaluationRunId,
    ],
    references: [evaluationRun.tenantId, evaluationRun.projectId, evaluationRun.id],
  }),
}));

export const conversationsEvaluatorRelations = relations(conversations, ({ many }) => ({
  evaluationResults: many(evaluationResult, {
    relationName: 'conversationEvaluationResults',
  }),
}));

export const datasetRunConversationRelationsRelations = relations(
  datasetRunConversationRelations,
  ({ one }) => ({
    datasetRun: one(datasetRun, {
      fields: [
        datasetRunConversationRelations.tenantId,
        datasetRunConversationRelations.projectId,
        datasetRunConversationRelations.datasetRunId,
      ],
      references: [datasetRun.tenantId, datasetRun.projectId, datasetRun.id],
    }),
    conversation: one(conversations, {
      fields: [
        datasetRunConversationRelations.tenantId,
        datasetRunConversationRelations.projectId,
        datasetRunConversationRelations.conversationId,
      ],
      references: [conversations.tenantId, conversations.projectId, conversations.id],
    }),
  })
);
