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
  McpToolDefinition,
  MessageContent,
  MessageMetadata,
  Models,
  StatusUpdateSettings,
  TaskMetadataConfig,
  ToolMcpConfig,
  ToolServerCapabilities,
} from '../types/utility';

// Projects table: Stores project metadata
export const projects = sqliteTable(
  'projects',
  {
    tenantId: text('tenant_id').notNull(),
    id: text('id').notNull(), // This IS the project ID
    name: text('name').notNull(),
    description: text('description').notNull(),

    // Project-level default model settingsuration that can be inherited by graphs and agents
    models: text('models', { mode: 'json' }).$type<Models>(),

    // Project-level stopWhen configuration that can be inherited by graphs and agents
    stopWhen: text('stop_when', { mode: 'json' }).$type<{
      transferCountIs?: number;
      stepCountIs?: number;
    }>(),

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);
// Context system: Shared context configurations
export const contextConfigs = sqliteTable(
  'context_configs',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),

    // Developer-defined Zod schema for validating incoming request context
    requestContextSchema: blob('request_context_schema', { mode: 'json' }).$type<unknown>(), // Stores serialized Zod schema

    // Object mapping template keys to fetch definitions that use request context data
    contextVariables: blob('context_variables', { mode: 'json' }).$type<
      Record<string, ContextFetchDefinition>
    >(),

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// Context cache: Stores actual fetched context data (conversation-scoped only)
export const contextCache = sqliteTable(
  'context_cache',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),

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

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
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
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    prompt: text('prompt').notNull(),

    conversationHistoryConfig: text('conversation_history_config', {
      mode: 'json',
    }).$type<ConversationHistoryConfig>(),
    models: text('models', { mode: 'json' }).$type<Models>(),

    // Agent-level stopWhen configuration (inherited from project)
    stopWhen: text('stop_when', { mode: 'json' }).$type<{
      stepCountIs?: number;
    }>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'agents_project_fk',
    }),
  ]
);

// Define the agent relations table for many-to-many relationships with directionality
// Supports both internal-internal and internal-external relationships
export const agentRelations = sqliteTable(
  'agent_relations',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    graphId: text('graph_id').notNull(),
    sourceAgentId: text('source_agent_id').notNull(),
    // For internal relationships
    targetAgentId: text('target_agent_id'),
    // For external relationships
    externalAgentId: text('external_agent_id'),
    relationType: text('relation_type'), // 'transfer' | 'delegate'
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'agent_relations_project_fk',
    }),
  ]
);

// Define external agents table for inter-graph communication
export const externalAgents = sqliteTable(
  'external_agents',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    baseUrl: text('base_url').notNull(), // A2A endpoint URL
    credentialReferenceId: text('credential_reference_id'),
    headers: blob('headers', { mode: 'json' }).$type<Record<string, string>>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
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

// Define the agent graph table (updated to reference context configs)
export const agentGraph = sqliteTable(
  'agent_graph',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    defaultAgentId: text('default_agent_id').notNull(),

    // Reference to shared context configuration for all agents in this graph
    contextConfigId: text('context_config_id'),

    // Graph-level model settingsuration that can be inherited by agents
    models: text('models', { mode: 'json' }).$type<Models>(),

    // Status updates configuration for intelligent progress summaries
    statusUpdates: text('status_updates', { mode: 'json' }).$type<StatusUpdateSettings>(),

    // Graph-level prompt that can be used as additional context for agents
    graphPrompt: text('graph_prompt'),

    // Graph-level stopWhen configuration that can be inherited by agents
    stopWhen: text('stop_when', { mode: 'json' }).$type<{
      transferCountIs?: number;
    }>(),

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'agent_graph_project_fk',
    }),
  ]
);

export const tasks = sqliteTable(
  'tasks',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    contextId: text('context_id').notNull(),
    status: text('status').notNull(),
    metadata: blob('metadata', { mode: 'json' }).$type<TaskMetadataConfig>(),
    agentId: text('agent_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// Define the task relations table for parent-child relationships
export const taskRelations = sqliteTable(
  'task_relations',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    parentTaskId: text('parent_task_id').notNull(),
    childTaskId: text('child_task_id').notNull(),
    relationType: text('relation_type').default('parent_child'), // Could be extended for other relation types
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

export const dataComponents = sqliteTable(
  'data_components',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    props: blob('props', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// Junction table for agent-specific data component associations
export const agentDataComponents = sqliteTable(
  'agent_data_components',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    agentId: text('agent_id').notNull(),
    dataComponentId: text('data_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    // Foreign key constraint to agents table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
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
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    summaryProps: blob('summary_props', { mode: 'json' }).$type<Record<string, unknown>>(),
    fullProps: blob('full_props', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// Junction table for agent-specific artifact component associations
export const agentArtifactComponents = sqliteTable(
  'agent_artifact_components',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    agentId: text('agent_id').notNull(),
    artifactComponentId: text('artifact_component_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    // Foreign key constraint to agents table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
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
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),

    // Enhanced MCP configuration
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

    // Server capabilities and status
    capabilities: blob('capabilities', { mode: 'json' }).$type<ToolServerCapabilities>(),

    // Connection health and monitoring
    status: text('status').notNull().default('unknown'),
    lastHealthCheck: text('last_health_check'),
    lastError: text('last_error'),

    // Tool discovery cache
    availableTools: blob('available_tools', { mode: 'json' }).$type<Array<McpToolDefinition>>(),
    lastToolsSync: text('last_tools_sync'),

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.credentialReferenceId],
      foreignColumns: [
        credentialReferences.tenantId,
        credentialReferences.projectId,
        credentialReferences.id,
      ],
      name: 'tools_credential_reference_fk',
    }).onDelete('set null'),
  ]
);

export const agentToolRelations = sqliteTable(
  'agent_tool_relations',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    agentId: text('agent_id').notNull(),
    toolId: text('tool_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    // Foreign key constraint to agents table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'agent_tool_relations_agent_fk',
    }).onDelete('cascade'),
    // Foreign key constraint to tools table
    foreignKey({
      columns: [table.tenantId, table.projectId, table.toolId],
      foreignColumns: [tools.tenantId, tools.projectId, tools.id],
      name: 'agent_tool_relations_tool_fk',
    }).onDelete('cascade'),
  ]
);

// Define conversations table to track user sessions
export const conversations = sqliteTable(
  'conversations',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    userId: text('user_id'),
    activeAgentId: text('active_agent_id').notNull(),
    title: text('title'),
    lastContextResolution: text('last_context_resolution'),
    metadata: blob('metadata', { mode: 'json' }).$type<ConversationMetadata>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// Define the unified message model supporting both A2A and OpenAI Chat Completions
export const messages = sqliteTable(
  'messages',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
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

    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// === Ledger tables (artifacts only) ===
export const ledgerArtifacts = sqliteTable(
  'ledger_artifacts',
  {
    // Primary identifier (maps to `artifactId`)
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),

    // Links
    taskId: text('task_id'),
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

    // Timestamps
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

// API Keys table for secure API authentication
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    graphId: text('graph_id').notNull(),
    publicId: text('public_id').notNull().unique(), // Public ID for O(1) lookup (e.g., "abc123def456")
    keyHash: text('key_hash').notNull(), // Hashed API key (never store plaintext)
    keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification (e.g., "sk_live_abc...")
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
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
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    type: text('type').notNull(), // Implementation type: 'keychain', 'nango', 'memory', etc.
    credentialStoreId: text('credential_store_id').notNull(), // Maps to framework.getCredentialStore(id)
    retrievalParams: blob('retrieval_params', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.projectId, t.id] })]
);

// Indexes & Constraints for ledger artifacts
export const ledgerArtifactsTaskIdIdx = index('ledger_artifacts_task_id_idx').on(
  ledgerArtifacts.taskId
);
export const ledgerArtifactsContextIdIdx = index('ledger_artifacts_context_id_idx').on(
  ledgerArtifacts.contextId
);

export const ledgerArtifactsTaskContextNameUnique = unique(
  'ledger_artifacts_task_context_name_unique'
).on(ledgerArtifacts.taskId, ledgerArtifacts.contextId, ledgerArtifacts.name);

// Relations definitions
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
}));

// Define relations for projects
export const projectsRelations = relations(projects, ({ many }) => ({
  // A project can have many agents
  agents: many(agents),
  // A project can have many agent graphs
  agentGraphs: many(agentGraph),
  // A project can have many tools
  tools: many(tools),
  // A project can have many context configs
  contextConfigs: many(contextConfigs),
  // A project can have many external agents
  externalAgents: many(externalAgents),
  // A project can have many conversations
  conversations: many(conversations),
  // A project can have many tasks
  tasks: many(tasks),
}));

// Define relations for taskRelations junction table
export const taskRelationsRelations = relations(taskRelations, ({ one }) => ({
  // Each relation has one parent task
  parentTask: one(tasks, {
    fields: [taskRelations.parentTaskId],
    references: [tasks.id],
    relationName: 'parentTask',
  }),
  // Each relation has one child task
  childTask: one(tasks, {
    fields: [taskRelations.childTaskId],
    references: [tasks.id],
    relationName: 'childTask',
  }),
}));

// Define relations for context system
export const contextConfigsRelations = relations(contextConfigs, ({ many, one }) => ({
  // A context config belongs to one project
  project: one(projects, {
    fields: [contextConfigs.tenantId, contextConfigs.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // A context config can be used by many agent graphs
  graphs: many(agentGraph),
  // A context config can have many cached entries
  cache: many(contextCache),
}));

export const contextCacheRelations = relations(contextCache, ({ one }) => ({
  // Each cache entry belongs to one context config
  contextConfig: one(contextConfigs, {
    fields: [contextCache.contextConfigId],
    references: [contextConfigs.id],
  }),
}));

// Define relations for agents
export const agentsRelations = relations(agents, ({ many, one }) => ({
  // A context config belongs to one project
  project: one(projects, {
    fields: [agents.tenantId, agents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // An agent can have many tasks
  tasks: many(tasks),
  // An agent can be the default agent for many graphs
  defaultForGraphs: many(agentGraph),
  // Agent relation tracking
  sourceRelations: many(agentRelations, {
    relationName: 'sourceRelations',
  }),
  targetRelations: many(agentRelations, {
    relationName: 'targetRelations',
  }),
  // Message tracking relations
  sentMessages: many(messages, {
    relationName: 'sentMessages',
  }),
  receivedMessages: many(messages, {
    relationName: 'receivedMessages',
  }),
  // Legacy message association (consider deprecating)
  associatedMessages: many(messages, {
    relationName: 'associatedAgent',
  }),
  toolRelations: many(agentToolRelations),
}));

// Define relations for agent graphs (updated to include context config)
export const agentGraphRelations = relations(agentGraph, ({ one }) => ({
  // An agent graph belongs to one project
  project: one(projects, {
    fields: [agentGraph.tenantId, agentGraph.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // An agent graph belongs to one default agent
  defaultAgent: one(agents, {
    fields: [agentGraph.defaultAgentId],
    references: [agents.id],
  }),
  // An agent graph can reference one context config
  contextConfig: one(contextConfigs, {
    fields: [agentGraph.contextConfigId],
    references: [contextConfigs.id],
  }),
}));

// Define relations for external agents
export const externalAgentsRelations = relations(externalAgents, ({ one, many }) => ({
  // An external agent belongs to one project
  project: one(projects, {
    fields: [externalAgents.tenantId, externalAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // An external agent can be referenced by many agent relations
  agentRelations: many(agentRelations),
  // An external agent may have one credential reference
  credentialReference: one(credentialReferences, {
    fields: [externalAgents.credentialReferenceId],
    references: [credentialReferences.id],
  }),
}));

// Define relations for API keys
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  // An API key belongs to one project
  project: one(projects, {
    fields: [apiKeys.tenantId, apiKeys.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // An API key belongs to one tenant and graph
  graph: one(agentGraph, {
    fields: [apiKeys.graphId],
    references: [agentGraph.id],
  }),
}));

// Define relations for agent tool relations
export const agentToolRelationsRelations = relations(agentToolRelations, ({ one }) => ({
  // An agent-tool relation belongs to one agent
  agent: one(agents, {
    fields: [agentToolRelations.agentId],
    references: [agents.id],
  }),
  // An agent-tool relation belongs to one tool
  tool: one(tools, {
    fields: [agentToolRelations.toolId],
    references: [tools.id],
  }),
}));

// Define relations for credential references
export const credentialReferencesRelations = relations(credentialReferences, ({ many }) => ({
  tools: many(tools),
}));

// Define relations for tools
export const toolsRelations = relations(tools, ({ one, many }) => ({
  // A tool belongs to one project
  project: one(projects, {
    fields: [tools.tenantId, tools.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // A tool can be used by many agents through agent-tool relations
  agentRelations: many(agentToolRelations),
  // A tool may have one credential reference
  credentialReference: one(credentialReferences, {
    fields: [tools.credentialReferenceId],
    references: [credentialReferences.id],
  }),
}));

// Define relations for conversations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  // A conversation belongs to one project
  project: one(projects, {
    fields: [conversations.tenantId, conversations.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // A conversation has many messages
  messages: many(messages),
  // A conversation has one active agent
  activeAgent: one(agents, {
    fields: [conversations.activeAgentId],
    references: [agents.id],
  }),
}));

// Define relations for messages
export const messagesRelations = relations(messages, ({ one, many }) => ({
  // A message belongs to one conversation
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
  // Sender tracking relations
  fromAgent: one(agents, {
    fields: [messages.fromAgentId],
    references: [agents.id],
    relationName: 'sentMessages',
  }),
  // Recipient tracking relations
  toAgent: one(agents, {
    fields: [messages.toAgentId],
    references: [agents.id],
    relationName: 'receivedMessages',
  }),
  // External agent sender tracking relations
  fromExternalAgent: one(externalAgents, {
    fields: [messages.fromExternalAgentId],
    references: [externalAgents.id],
    relationName: 'receivedExternalMessages',
  }),
  // External agent recipient tracking relations
  toExternalAgent: one(externalAgents, {
    fields: [messages.toExternalAgentId],
    references: [externalAgents.id],
    relationName: 'sentExternalMessages',
  }),
  // A message may be associated with a task
  task: one(tasks, {
    fields: [messages.taskId],
    references: [tasks.id],
  }),
  // A message may have a parent message (for threading)
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: 'parentChild',
  }),
  // A message may have child messages
  childMessages: many(messages, {
    relationName: 'parentChild',
  }),
}));

// Define relations for artifact components
export const artifactComponentsRelations = relations(artifactComponents, ({ many }) => ({
  // An artifact component can be associated with many agents
  agentRelations: many(agentArtifactComponents),
}));

// Define relations for agent-artifact component associations
export const agentArtifactComponentsRelations = relations(agentArtifactComponents, ({ one }) => ({
  // An agent-artifact component relation belongs to one agent
  agent: one(agents, {
    fields: [agentArtifactComponents.agentId],
    references: [agents.id],
  }),
  // An agent-artifact component relation belongs to one artifact component
  artifactComponent: one(artifactComponents, {
    fields: [agentArtifactComponents.artifactComponentId],
    references: [artifactComponents.id],
  }),
}));

// Define relations for agent relations
export const agentRelationsRelations = relations(agentRelations, ({ one }) => ({
  // An agent relation belongs to one graph
  graph: one(agentGraph, {
    fields: [agentRelations.graphId],
    references: [agentGraph.id],
  }),
  // An agent relation has one source agent
  sourceAgent: one(agents, {
    fields: [agentRelations.sourceAgentId],
    references: [agents.id],
    relationName: 'sourceRelations',
  }),
  // An agent relation may have one target agent (for internal relations)
  targetAgent: one(agents, {
    fields: [agentRelations.targetAgentId],
    references: [agents.id],
    relationName: 'targetRelations',
  }),
  // An agent relation may have one external agent (for external relations)
  externalAgent: one(externalAgents, {
    fields: [agentRelations.externalAgentId],
    references: [externalAgents.id],
  }),
}));
