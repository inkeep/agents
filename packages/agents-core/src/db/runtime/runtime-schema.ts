import { relations } from 'drizzle-orm';
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { organization, user } from '../../auth/auth-schema';
import type { Part } from '../../types/a2a';
import type {
  ConversationMetadata,
  MessageContent,
  MessageMetadata,
  TaskMetadataConfig,
} from '../../types/utility';
import type { ResolvedRef } from '../../validation/dolt-schemas';

// Re-export Better Auth generated tables (runtime entities)
export {
  account,
  deviceCode,
  invitation,
  member,
  organization,
  session,
  ssoProvider,
  user,
  verification,
} from '../../auth/auth-schema';

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

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};

// ============================================================================
// RUNTIME TABLES (Postgres - Not Versioned)
// ============================================================================
// NOTE: These tables have no foreign keys to config tables since they're in
// a different database. Application code must enforce referential integrity
// for cross-database references (e.g., agentId, subAgentId, contextConfigId).
//
// Within-runtime-DB foreign keys use CASCADE or SET NULL for automatic cleanup.

// --- Root tables (no FK dependencies) ---

/**
 * Runtime projects table - source of truth for which projects exist in a tenant.
 * This is NOT versioned - project existence is tracked here while
 * project configuration/content lives in the versioned config DB.
 *
 * Named 'project_metadata' to avoid conflict with the manage-schema 'projects' table.
 */
export const projectMetadata = pgTable(
  'project_metadata',
  {
    id: varchar('id', { length: 256 }).notNull(),
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 256 }),
    mainBranchName: varchar('main_branch_name', { length: 512 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index('project_metadata_tenant_idx').on(table.tenantId),
    index('project_metadata_main_branch_idx').on(table.mainBranchName),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'project_metadata_organization_fk',
    }).onDelete('cascade'),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    ...projectScoped,
    userId: varchar('user_id', { length: 256 }),
    agentId: varchar('agent_id', { length: 256 }),
    activeSubAgentId: varchar('active_sub_agent_id', { length: 256 }).notNull(),
    ref: jsonb('ref').$type<ResolvedRef>(),
    title: text('title'),
    lastContextResolution: timestamp('last_context_resolution', { mode: 'string' }),
    metadata: jsonb('metadata').$type<ConversationMetadata>(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

export const tasks = pgTable(
  'tasks',
  {
    ...subAgentScoped,
    contextId: varchar('context_id', { length: 256 }).notNull(),
    ref: jsonb('ref').$type<ResolvedRef>(),
    status: varchar('status', { length: 256 }).notNull(),
    metadata: jsonb('metadata').$type<TaskMetadataConfig>(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

export const apiKeys = pgTable(
  'api_keys',
  {
    ...projectScoped,
    agentId: varchar('agent_id', { length: 256 }).notNull(),
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
      columns: [t.tenantId],
      foreignColumns: [organization.id],
      name: 'api_keys_organization_fk',
    }).onDelete('cascade'),
    index('api_keys_tenant_agent_idx').on(t.tenantId, t.agentId),
    index('api_keys_prefix_idx').on(t.keyPrefix),
    index('api_keys_public_id_idx').on(t.publicId),
  ]
);

/**
 * Trigger invocations - records each time a webhook trigger is invoked.
 * This is runtime data (transactional) so it lives in PostgreSQL, not DoltGres.
 * NOTE: No FK to triggers table since triggers is in a different database (DoltGres).
 * Application code must enforce referential integrity for triggerId.
 * Can optionally link to conversations when the trigger creates one.
 */
export const triggerInvocations = pgTable(
  'trigger_invocations',
  {
    ...agentScoped,
    triggerId: varchar('trigger_id', { length: 256 }).notNull(),
    conversationId: varchar('conversation_id', { length: 256 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    requestPayload: jsonb('request_payload').notNull(),
    transformedPayload: jsonb('transformed_payload'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    index('trigger_invocations_trigger_idx').on(table.triggerId, table.createdAt),
    index('trigger_invocations_status_idx').on(table.triggerId, table.status),
    // Optional FK to conversations - only if conversationId is set
    // Note: Using a separate constraint to allow NULL conversationId
  ]
);

/**
 * Slack workspace installations - records each Slack workspace installation.
 * Enforces workspace -> tenant uniqueness and provides audit trail.
 * Stores reference to Nango connection for token retrieval.
 */
export const workAppSlackWorkspaces = pgTable(
  'work_app_slack_workspaces',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 256 })
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),
    slackAppId: varchar('slack_app_id', { length: 256 }),
    slackTeamName: varchar('slack_team_name', { length: 512 }),
    nangoProviderConfigKey: varchar('nango_provider_config_key', { length: 256 })
      .notNull()
      .default('work-apps-slack'),
    nangoConnectionId: varchar('nango_connection_id', { length: 256 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    installedByUserId: text('installed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    unique('work_app_slack_workspaces_tenant_team_unique').on(table.tenantId, table.slackTeamId),
    index('work_app_slack_workspaces_tenant_idx').on(table.tenantId),
    index('work_app_slack_workspaces_team_idx').on(table.slackTeamId),
    index('work_app_slack_workspaces_nango_idx').on(table.nangoConnectionId),
  ]
);

/**
 * Slack user mappings - maps Slack users to Inkeep users.
 * Enables Slack users to trigger agents after linking their accounts.
 * Unique per tenant + clientId + slackTeamId + slackUserId.
 */
export const workAppSlackUserMappings = pgTable(
  'work_app_slack_user_mappings',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 256 })
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 256 }).notNull().default('work-apps-slack'),
    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),
    inkeepUserId: text('inkeep_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slackUsername: varchar('slack_username', { length: 256 }),
    slackEmail: varchar('slack_email', { length: 256 }),
    linkedAt: timestamp('linked_at', { mode: 'string' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
    ...timestamps,
  },
  (table) => [
    unique('work_app_slack_user_mappings_unique').on(
      table.tenantId,
      table.clientId,
      table.slackTeamId,
      table.slackUserId
    ),
    index('work_app_slack_user_mappings_tenant_idx').on(table.tenantId),
    index('work_app_slack_user_mappings_user_idx').on(table.inkeepUserId),
    index('work_app_slack_user_mappings_team_idx').on(table.slackTeamId),
    index('work_app_slack_user_mappings_slack_user_idx').on(table.slackUserId),
  ]
);

/**
 * Slack account link codes - temporary codes for device code flow linking.
 * User generates a code in Slack, enters it in the dashboard to complete linking.
 * Stores SHA-256 hash of the code for security. Codes expire after 1 hour.
 */
export const workAppSlackAccountLinkCodes = pgTable(
  'work_app_slack_account_link_codes',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 256 })
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 256 }).notNull().default('work-apps-slack'),
    linkCodeHash: varchar('link_code_hash', { length: 64 }).notNull().unique(),
    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),
    slackUsername: varchar('slack_username', { length: 256 }),
    slackEmail: varchar('slack_email', { length: 256 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { mode: 'string' }),
    usedByUserId: text('used_by_user_id'),
    ...timestamps,
  },
  (table) => [
    index('work_app_slack_account_link_codes_tenant_idx').on(table.tenantId),
    index('work_app_slack_account_link_codes_hash_idx').on(table.linkCodeHash),
    index('work_app_slack_account_link_codes_status_idx').on(table.status, table.expiresAt),
  ]
);

/**
 * @deprecated Use workAppSlackUserMappings instead. Kept for backward compatibility during migration.
 * Slack user links - maps Slack users to Inkeep users.
 * Enables Slack users to trigger agents after linking their accounts.
 * One link per Slack user per workspace (unique on slackUserId + slackTeamId).
 */
export const slackUserLinks = pgTable(
  'slack_user_links',
  {
    id: varchar('id', { length: 256 }).primaryKey(),

    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    nangoConnectionId: varchar('nango_connection_id', { length: 256 }),

    slackUsername: varchar('slack_username', { length: 256 }),
    slackEmail: varchar('slack_email', { length: 256 }),

    linkedAt: timestamp('linked_at', { mode: 'string' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
  },
  (table) => [
    unique('slack_user_links_unique').on(table.slackUserId, table.slackTeamId),
    index('slack_user_links_user_idx').on(table.userId),
    index('slack_user_links_team_idx').on(table.slackTeamId),
    index('slack_user_links_slack_user_idx').on(table.slackUserId),
  ]
);

/**
 * @deprecated Use workAppSlackAccountLinkCodes instead. Kept for backward compatibility during migration.
 * Slack link codes - temporary codes for device code flow linking.
 * User generates a code in Slack, enters it in the dashboard to complete linking.
 * Codes expire after 10 minutes.
 */
export const slackLinkCodes = pgTable(
  'slack_link_codes',
  {
    id: varchar('id', { length: 256 }).primaryKey(),

    code: varchar('code', { length: 20 }).notNull().unique(),

    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),
    slackUsername: varchar('slack_username', { length: 256 }),
    slackEmail: varchar('slack_email', { length: 256 }),

    nangoConnectionId: varchar('nango_connection_id', { length: 256 }),

    status: varchar('status', { length: 20 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { mode: 'string' }),
    usedByUserId: text('used_by_user_id'),

    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('slack_link_codes_code_idx').on(table.code),
    index('slack_link_codes_status_idx').on(table.status, table.expiresAt),
  ]
);

// --- Tables with FK dependencies ---

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
    // Cascade delete messages when conversation is deleted
    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'messages_conversation_fk',
    }).onDelete('cascade'),
    // NOTE: taskId and parentMessageId FKs are intentionally omitted.
    // Composite FKs with SET NULL don't work when other columns (tenantId, projectId)
    // are NOT NULL - PostgreSQL tries to NULL all FK columns.
    // These optional references should be handled in application code if needed.
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
    // Cascade delete when parent task is deleted
    foreignKey({
      columns: [table.tenantId, table.projectId, table.parentTaskId],
      foreignColumns: [tasks.tenantId, tasks.projectId, tasks.id],
      name: 'task_relations_parent_fk',
    }).onDelete('cascade'),
    // Cascade delete when child task is deleted
    foreignKey({
      columns: [table.tenantId, table.projectId, table.childTaskId],
      foreignColumns: [tasks.tenantId, tasks.projectId, tasks.id],
      name: 'task_relations_child_fk',
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
    index('ledger_artifacts_task_id_idx').on(table.taskId),
    index('ledger_artifacts_tool_call_id_idx').on(table.toolCallId),
    index('ledger_artifacts_context_id_idx').on(table.contextId),
    unique('ledger_artifacts_task_context_name_unique').on(
      table.taskId,
      table.contextId,
      table.name
    ),
    // Cascade delete when conversation is deleted
    foreignKey({
      columns: [table.tenantId, table.projectId, table.contextId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'ledger_artifacts_conversation_fk',
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
    ref: jsonb('ref').$type<ResolvedRef>(),
    value: jsonb('value').$type<unknown>().notNull(),
    requestHash: varchar('request_hash', { length: 256 }),
    fetchedAt: timestamp('fetched_at', { mode: 'string' }).notNull().defaultNow(),
    fetchSource: varchar('fetch_source', { length: 256 }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    index('context_cache_lookup_idx').on(
      table.conversationId,
      table.contextConfigId,
      table.contextVariableKey
    ),
    // Cascade delete when conversation is deleted
    foreignKey({
      columns: [table.tenantId, table.projectId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.projectId, conversations.id],
      name: 'context_cache_conversation_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Execution of a suite of items from a dataset. Represents a batch run that
 * processes dataset items and creates conversations (basically a batch run of conversations). Tracks the execution
 * status and links to conversations created during the run via
 * datasetRunConversationRelations join table.
 *
 * When evaluators are specified, an evaluation job is automatically created after the run completes,
 * and the evaluationJobConfigId links to that job.
 *
 * Includes: datasetId (which dataset to run),
 * datasetRunConfigId (optional: if created from a config),
 * evaluationJobConfigId (optional: links to evaluation job created for this run), and timestamps
 */
export const datasetRun = pgTable(
  'dataset_run',
  {
    ...projectScoped,
    datasetId: text('dataset_id').notNull(),
    datasetRunConfigId: text('dataset_run_config_id'),
    evaluationJobConfigId: text('evaluation_job_config_id'),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

/**
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
    unique('dataset_run_conversation_relations_unique').on(
      table.datasetRunId,
      table.conversationId
    ),
  ]
);

/**
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
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })]
);

/**
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
      columns: [table.tenantId, table.projectId, table.evaluationRunId],
      foreignColumns: [evaluationRun.tenantId, evaluationRun.projectId, evaluationRun.id],
      name: 'evaluation_result_evaluation_run_fk',
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// RUNTIME RELATIONS
// ============================================================================
// Note: Relations only within the runtime DB. Cross-DB relations must be
// handled in application code.

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
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

export const tasksRelations = relations(tasks, ({ many }) => ({
  messages: many(messages),
  ledgerArtifacts: many(ledgerArtifacts),
  parentRelations: many(taskRelations, {
    relationName: 'childTask',
  }),
  childRelations: many(taskRelations, {
    relationName: 'parentTask',
  }),
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

export const ledgerArtifactsRelations = relations(ledgerArtifacts, ({ one }) => ({
  task: one(tasks, {
    fields: [ledgerArtifacts.taskId],
    references: [tasks.id],
  }),
}));
