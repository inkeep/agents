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
import type { AgentStopWhen, GraphStopWhen, StopWhen } from '../validation/schemas';

const tenantScoped = {
  tenantId: text('tenant_id').notNull(),
  id: text('id').notNull(),
};

const projectScoped = {
  ...tenantScoped,
  projectId: text('project_id').notNull(),
};

const graphScoped = {
  ...projectScoped,
  graphId: text('graph_id').notNull(),
};

const agentScoped = {
  ...graphScoped,
  agentId: text('agent_id').notNull(),
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

    // Project-level default model settings that can be inherited by graphs and agents
    models: text('models', { mode: 'json' }).$type<ProjectModels>(),

    // Project-level stopWhen configuration that can be inherited by graphs and agents
    stopWhen: text('stop_when', { mode: 'json' }).$type<StopWhen>(),

    // Project-level sandbox configuration for function execution
    sandboxConfig: text('sandbox_config', { mode: 'json' }).$type<{
      provider: 'vercel' | 'daytona' | 'local';
      runtime: 'node22' | 'typescript';
      timeout?: number;
      vcpus?: number;
    }>(),

    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

export const agentGraph = sqliteTable(
  'agent_graph',
  {
    ...projectScoped,
    name: text('name').notNull(),
    description: text('description'),
    defaultAgentId: text('default_agent_id'),

    // Reference to shared context configuration for all agents in this graph
    contextConfigId: text('context_config_id'), // add fk relationship

    // Graph-level model settingsuration that can be inherited by agents
    models: text('models', { mode: 'json' }).$type<Models>(),

    // Status updates configuration for intelligent progress summaries
    statusUpdates: text('status_updates', { mode: 'json' }).$type<StatusUpdateSettings>(),

    // Graph-level prompt that can be used as additional context for agents
    graphPrompt: text('graph_prompt'),

    // Graph-level stopWhen configuration that can be inherited by agents
    stopWhen: text('stop_when', { mode: 'json' }).$type<GraphStopWhen>(),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'agent_graph_project_fk',
    }).onDelete('cascade'),
  ]
);

// Context system: Shared context configurations
export const contextConfigs = sqliteTable(
  'context_configs',
  {
    ...graphScoped,

    // Developer-defined Zod schema for validating incoming request context
    headersSchema: blob('headers_schema', { mode: 'json' }).$type<unknown>(), // Stores serialized Zod schema

    // Object mapping template keys to fetch definitions that use request context data
    contextVariables: blob('context_variables', { mode: 'json' }).$type<
      Record<string, ContextFetchDefinition>
    >(),

    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'context_configs_graph_fk',
    }).onDelete('cascade'),
  ]
);

// Context cache: Stores actual fetched context data (conversation-scoped only)
export const contextCache = sqliteTable(
  'context_cache',
  {
    ...projectScoped,

    // Always scoped to conversation for complete data isolation
    conversationId: text('conversation_id').notNull(),

    // Reference to the context config and specific fetch definition
    contextConfigId: text('context_config_id').notNull(),
    contextVariableKey: text('context_variable_key').notNull(), // Key from contextVariables object

    // The actual cached context data
    value: blob('value', { mode: 'json' }).$type<unknown>().notNull(),

    // Request hash for cache invalidation based on context changes
    requestHash: text('request_hash'), // Hash of request context that triggered this cache

    // Metadata for monitoring and debugging
    fetchedAt: text('fetched_at').notNull(),
    fetchSource: text('fetch_source'), // URL or source identifier
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

// Define the agents table schema
export const agents = sqliteTable(
  'agents',
  {
    ...graphScoped,
    ...uiProperties,
    prompt: text('prompt').notNull(),

    conversationHistoryConfig: text('conversation_history_config', {
      mode: 'json',
    }).$type<ConversationHistoryConfig>(),
    models: text('models', { mode: 'json' }).$type<Models>(),

    // Agent-level stopWhen configuration (inherited from project)
    stopWhen: text('stop_when', { mode: 'json' }).$type<AgentStopWhen>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'agents_graph_fk',
    }).onDelete('cascade'),
  ]
);

// Define the agent relations table for many-to-many relationships with directionality
// Supports both internal-internal and internal-external relationships
export const agentRelations = sqliteTable(
  'agent_relations',
  {
    ...graphScoped,
    sourceAgentId: text('source_agent_id').notNull(),
    // For internal relationships
    targetAgentId: text('target_agent_id'),
    // For external relationships
    externalAgentId: text('external_agent_id'),
    relationType: text('relation_type'), // 'transfer' | 'delegate'
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'agent_relations_graph_fk',
    }).onDelete('cascade'),
  ]
);

// Define external agents table for inter-graph communication
export const externalAgents = sqliteTable(
  'external_agents',
  {
    ...graphScoped,
    ...uiProperties,
    baseUrl: text('base_url').notNull(), // A2A endpoint URL
    credentialReferenceId: text('credential_reference_id'),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string>>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'external_agents_graph_fk',
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
    ...agentScoped,
    contextId: text('context_id').notNull(),
    status: text('status').notNull(),
    metadata: blob('metadata', { mode: 'json' }).$type<TaskMetadataConfig>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.graphId, agents.id],
      name: 'tasks_agent_fk',
    }).onDelete('cascade'),
  ]
);

// Define the task relations table for parent-child relationships
export const taskRelations = sqliteTable(
  'task_relations',
  {
    ...projectScoped,
    parentTaskId: text('parent_task_id').notNull(),
    childTaskId: text('child_task_id').notNull(),
    relationType: text('relation_type').default('parent_child'), // Could be extended for other relation types
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

// Junction table for agent-specific data component associations
export const agentDataComponents = sqliteTable(
  'agent_data_components',
  {
    ...agentScoped,
    dataComponentId: text('data_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    // Foreign key constraint to agents table (ensures graph and project exist via cascade)
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.graphId, agents.id],
      name: 'agent_data_components_agent_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to data_components table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.dataComponentId],
      foreignColumns: [dataComponents.tenantId, dataComponents.projectId, dataComponents.id],
      name: 'agent_data_components_data_component_fk',
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

// Junction table for agent-specific artifact component associations
export const agentArtifactComponents = sqliteTable(
  'agent_artifact_components',
  {
    ...agentScoped,
    artifactComponentId: text('artifact_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId, table.id],
    }),
    // Foreign key constraint to agents table (ensures graph and project exist via cascade)
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.graphId, agents.id],
      name: 'agent_artifact_components_agent_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to artifact_components table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.artifactComponentId],
      foreignColumns: [
        artifactComponents.tenantId,
        artifactComponents.projectId,
        artifactComponents.id,
      ],
      name: 'agent_artifact_components_artifact_component_fk',
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

    // Image URL for custom tool icon (supports regular URLs and base64 encoded images)
    imageUrl: text('image_url'),

    // Server capabilities and status (only for MCP tools)
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
    }).onDelete('cascade')
  ]
);

export const functionTools = sqliteTable(
  'function_tools',
  {
    ...graphScoped,
    name: text('name').notNull(),
    description: text('description'),
    functionId: text('function_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'function_tools_graph_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to functions table
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

export const agentToolRelations = sqliteTable(
  'agent_tool_relations',
  {
    ...agentScoped,
    toolId: text('tool_id').notNull(),
    selectedTools: blob('selected_tools', { mode: 'json' }).$type<string[] | null>(),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    // Foreign key constraint to agents table (which includes project and graph scope)
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.graphId, agents.id],
      name: 'agent_tool_relations_agent_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to tools table (MCP tools)
    foreignKey({
      columns: [table.tenantId, table.projectId, table.toolId],
      foreignColumns: [tools.tenantId, tools.projectId, tools.id],
      name: 'agent_tool_relations_tool_fk',
    }).onDelete('cascade'),
  ]
);

// Junction table for agent-function tool relations
export const agentFunctionToolRelations = sqliteTable(
  'agent_function_tool_relations',
  {
    ...agentScoped,
    functionToolId: text('function_tool_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.graphId, table.id] }),
    // Foreign key constraint to agents table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.graphId, agents.id],
      name: 'agent_function_tool_relations_agent_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to functionTools table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.graphId, table.functionToolId],
      foreignColumns: [
        functionTools.tenantId,
        functionTools.projectId,
        functionTools.graphId,
        functionTools.id,
      ],
      name: 'agent_function_tool_relations_function_tool_fk',
    }).onDelete('cascade'),
  ]
);

// Define conversations table to track user sessions
export const conversations = sqliteTable(
  'conversations',
  {
    ...projectScoped,
    userId: text('user_id'),
    activeAgentId: text('active_agent_id').notNull(),
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

// Define the unified message model supporting both A2A and OpenAI Chat Completions
export const messages = sqliteTable(
  'messages',
  {
    ...projectScoped,
    conversationId: text('conversation_id').notNull(),

    // Role mapping: user, agent, system (unified for both formats)
    role: text('role').notNull(), // 'user' | 'agent' | 'system'

    // Agent sender/recipient tracking (nullable - only populated when relevant)
    fromAgentId: text('from_agent_id'), // Populated when message is from an agent
    toAgentId: text('to_agent_id'), // Populated when message is directed to a specific agent (e.g., transfers/delegations)

    // External agent sender tracking
    fromExternalAgentId: text('from_external_agent_id'), // Populated when message is directed from an external agent

    // External agent recipient tracking
    toExternalAgentId: text('to_external_agent_id'), // Populated when message is directed to an external agent

    // Message content stored as JSON to support both formats
    content: blob('content', { mode: 'json' }).$type<MessageContent>().notNull(),

    // Message classification and filtering
    visibility: text('visibility').notNull().default('user-facing'), // 'user-facing' | 'internal' | 'system' | 'external'
    messageType: text('message_type').notNull().default('chat'), // 'chat' | 'a2a-request' | 'a2a-response' | 'task-update' | 'tool-call'

    // Legacy agent association (consider deprecating in favor of fromAgentId/toAgentId)
    agentId: text('agent_id'),
    taskId: text('task_id'),
    parentMessageId: text('parent_message_id'), // Remove self-reference constraint here

    // A2A specific fields
    a2aTaskId: text('a2a_task_id'), // Links to A2A task when relevant
    a2aSessionId: text('a2a_session_id'), // A2A session identifier

    // Metadata for extensions
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

// === Ledger tables (artifacts only) ===
export const ledgerArtifacts = sqliteTable(
  'ledger_artifacts',
  {
    ...projectScoped,

    // Links
    taskId: text('task_id').notNull(),
    toolCallId: text('tool_call_id'), // Added for traceability to the specific tool execution
    contextId: text('context_id').notNull(),

    // Core Artifact fields
    type: text('type').notNull().default('source'),
    name: text('name'),
    description: text('description'),
    parts: blob('parts', { mode: 'json' }).$type<Part[] | null>(),
    metadata: blob('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),

    // Extra ledger information (not part of the Artifact spec – kept optional)
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

// API Keys table for secure API authentication
export const apiKeys = sqliteTable(
  'api_keys',
  {
    ...graphScoped,
    publicId: text('public_id').notNull().unique(), // Public ID for O(1) lookup (e.g., "abc123def456")
    keyHash: text('key_hash').notNull(), // Hashed API key (never store plaintext)
    keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification (e.g., "sk_live_abc...")
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
      columns: [t.tenantId, t.projectId, t.graphId],
      foreignColumns: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
      name: 'api_keys_graph_fk',
    }).onDelete('cascade'),
    index('api_keys_tenant_graph_idx').on(t.tenantId, t.graphId),
    index('api_keys_prefix_idx').on(t.keyPrefix),
    index('api_keys_public_id_idx').on(t.publicId),
  ]
);

// Credential references for CredentialStore implementations
export const credentialReferences = sqliteTable(
  'credential_references',
  {
    ...projectScoped,
    type: text('type').notNull(), // Implementation type: 'keychain', 'nango', 'memory', etc.
    credentialStoreId: text('credential_store_id').notNull(), // Maps to framework.getCredentialStore(id)
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
  // A task belongs to one project
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
  // A task belongs to one agent
  agent: one(agents, {
    fields: [tasks.agentId],
    references: [agents.id],
  }),
  // A task can have many messages associated with it
  messages: many(messages),
  // A task can have many ledger artifacts
  ledgerArtifacts: many(ledgerArtifacts),
}));

// Define relations for projects
export const projectsRelations = relations(projects, ({ many }) => ({
  agents: many(agents),
  agentGraphs: many(agentGraph),
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

// Define relations for taskRelations junction table
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
  graphs: many(agentGraph),
  cache: many(contextCache),
}));

export const contextCacheRelations = relations(contextCache, ({ one }) => ({
  contextConfig: one(contextConfigs, {
    fields: [contextCache.contextConfigId],
    references: [contextConfigs.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many, one }) => ({
  project: one(projects, {
    fields: [agents.tenantId, agents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  tasks: many(tasks),
  defaultForGraphs: many(agentGraph),
  sourceRelations: many(agentRelations, {
    relationName: 'sourceRelations',
  }),
  targetRelations: many(agentRelations, {
    relationName: 'targetRelations',
  }),
  sentMessages: many(messages, {
    relationName: 'sentMessages',
  }),
  receivedMessages: many(messages, {
    relationName: 'receivedMessages',
  }),
  associatedMessages: many(messages, {
    relationName: 'associatedAgent',
  }),
  toolRelations: many(agentToolRelations),
  functionToolRelations: many(agentFunctionToolRelations),
  dataComponentRelations: many(agentDataComponents),
  artifactComponentRelations: many(agentArtifactComponents),
}));

export const agentGraphRelations = relations(agentGraph, ({ one, many }) => ({
  project: one(projects, {
    fields: [agentGraph.tenantId, agentGraph.projectId],
    references: [projects.tenantId, projects.id],
  }),
  defaultAgent: one(agents, {
    fields: [agentGraph.defaultAgentId],
    references: [agents.id],
  }),
  contextConfig: one(contextConfigs, {
    fields: [agentGraph.contextConfigId],
    references: [contextConfigs.id],
  }),
  functionTools: many(functionTools),
}));

export const externalAgentsRelations = relations(externalAgents, ({ one, many }) => ({
  project: one(projects, {
    fields: [externalAgents.tenantId, externalAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agentRelations: many(agentRelations),
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
  graph: one(agentGraph, {
    fields: [apiKeys.graphId],
    references: [agentGraph.id],
  }),
}));

export const agentToolRelationsRelations = relations(agentToolRelations, ({ one }) => ({
  agent: one(agents, {
    fields: [agentToolRelations.agentId],
    references: [agents.id],
  }),
  tool: one(tools, {
    fields: [agentToolRelations.toolId],
    references: [tools.id],
  }),
}));

export const credentialReferencesRelations = relations(credentialReferences, ({ many }) => ({
  tools: many(tools),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  project: one(projects, {
    fields: [tools.tenantId, tools.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agentRelations: many(agentToolRelations),
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
  activeAgent: one(agents, {
    fields: [conversations.activeAgentId],
    references: [agents.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  // Legacy agent association (consider deprecating)
  agent: one(agents, {
    fields: [messages.agentId],
    references: [agents.id],
    relationName: 'associatedAgent',
  }),
  fromAgent: one(agents, {
    fields: [messages.fromAgentId],
    references: [agents.id],
    relationName: 'sentMessages',
  }),
  toAgent: one(agents, {
    fields: [messages.toAgentId],
    references: [agents.id],
    relationName: 'receivedMessages',
  }),
  fromExternalAgent: one(externalAgents, {
    fields: [messages.fromExternalAgentId],
    references: [externalAgents.id],
    relationName: 'receivedExternalMessages',
  }),
  toExternalAgent: one(externalAgents, {
    fields: [messages.toExternalAgentId],
    references: [externalAgents.id],
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

export const artifactComponentsRelations = relations(artifactComponents, ({ many }) => ({
  agentRelations: many(agentArtifactComponents),
}));

export const agentArtifactComponentsRelations = relations(agentArtifactComponents, ({ one }) => ({
  agent: one(agents, {
    fields: [agentArtifactComponents.agentId],
    references: [agents.id],
  }),
  artifactComponent: one(artifactComponents, {
    fields: [agentArtifactComponents.artifactComponentId],
    references: [artifactComponents.id],
  }),
}));

export const dataComponentsRelations = relations(dataComponents, ({ many, one }) => ({
  project: one(projects, {
    fields: [dataComponents.tenantId, dataComponents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agentRelations: many(agentDataComponents),
}));

export const agentDataComponentsRelations = relations(agentDataComponents, ({ one }) => ({
  agent: one(agents, {
    fields: [agentDataComponents.agentId],
    references: [agents.id],
  }),
  dataComponent: one(dataComponents, {
    fields: [agentDataComponents.dataComponentId],
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

// Functions relations
export const functionsRelations = relations(functions, ({ many }) => ({
  functionTools: many(functionTools),
}));

export const agentRelationsRelations = relations(agentRelations, ({ one }) => ({
  graph: one(agentGraph, {
    fields: [agentRelations.graphId],
    references: [agentGraph.id],
  }),
  sourceAgent: one(agents, {
    fields: [agentRelations.sourceAgentId],
    references: [agents.id],
    relationName: 'sourceRelations',
  }),
  targetAgent: one(agents, {
    fields: [agentRelations.targetAgentId],
    references: [agents.id],
    relationName: 'targetRelations',
  }),
  externalAgent: one(externalAgents, {
    fields: [agentRelations.externalAgentId],
    references: [externalAgents.id],
  }),
}));

// FunctionTools relations
export const functionToolsRelations = relations(functionTools, ({ one, many }) => ({
  project: one(projects, {
    fields: [functionTools.tenantId, functionTools.projectId],
    references: [projects.tenantId, projects.id],
  }),
  graph: one(agentGraph, {
    fields: [functionTools.tenantId, functionTools.projectId, functionTools.graphId],
    references: [agentGraph.tenantId, agentGraph.projectId, agentGraph.id],
  }),
  function: one(functions, {
    fields: [functionTools.tenantId, functionTools.projectId, functionTools.functionId],
    references: [functions.tenantId, functions.projectId, functions.id],
  }),
  agentRelations: many(agentFunctionToolRelations),
}));

// AgentFunctionToolRelations relations
export const agentFunctionToolRelationsRelations = relations(
  agentFunctionToolRelations,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentFunctionToolRelations.agentId],
      references: [agents.id],
    }),
    functionTool: one(functionTools, {
      fields: [agentFunctionToolRelations.functionToolId],
      references: [functionTools.id],
    }),
  })
);
