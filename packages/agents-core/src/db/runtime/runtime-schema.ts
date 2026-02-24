import { relations } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { organization, user } from '../../auth/auth-schema';
import type { Part } from '../../types/a2a';
import type {
  ConversationMetadata,
  MessageContent,
  MessageMetadata,
  TaskMetadataConfig,
  WorkAppGitHubAccountType,
  WorkAppGitHubInstallationStatus,
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
    shouldAllowJoinFromWorkspace: boolean('should_allow_join_from_workspace')
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    unique('work_app_slack_workspaces_tenant_team_unique').on(table.tenantId, table.slackTeamId),
    unique('work_app_slack_workspaces_nango_connection_unique').on(table.nangoConnectionId),
    index('work_app_slack_workspaces_tenant_idx').on(table.tenantId),
    index('work_app_slack_workspaces_team_idx').on(table.slackTeamId),
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
 * Slack channel agent configurations - maps Slack channels to default agents.
 * Allows admins to set channel-specific agent defaults that override workspace defaults.
 * Unique per tenant + slackTeamId + slackChannelId.
 */
export const workAppSlackChannelAgentConfigs = pgTable(
  'work_app_slack_channel_agent_configs',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 256 })
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackChannelId: varchar('slack_channel_id', { length: 256 }).notNull(),
    slackChannelName: varchar('slack_channel_name', { length: 256 }),
    slackChannelType: varchar('slack_channel_type', { length: 50 }),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
    agentName: varchar('agent_name', { length: 256 }),
    configuredByUserId: text('configured_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    enabled: boolean('enabled').notNull().default(true),
    grantAccessToMembers: boolean('grant_access_to_members').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique('work_app_slack_channel_agent_configs_unique').on(
      table.tenantId,
      table.slackTeamId,
      table.slackChannelId
    ),
    index('work_app_slack_channel_agent_configs_tenant_idx').on(table.tenantId),
    index('work_app_slack_channel_agent_configs_team_idx').on(table.slackTeamId),
    index('work_app_slack_channel_agent_configs_channel_idx').on(table.slackChannelId),
  ]
);

/**
 * Scheduled trigger invocations - records each execution of a scheduled trigger.
 * NOTE: No FK to scheduled_triggers table since it's in a different database (DoltGres).
 */
export const scheduledTriggerInvocations = pgTable(
  'scheduled_trigger_invocations',
  {
    ...agentScoped,
    scheduledTriggerId: varchar('scheduled_trigger_id', { length: 256 }).notNull(),
    status: varchar('status', { length: 50 })
      .notNull()
      .$type<'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    resolvedPayload: jsonb('resolved_payload').$type<Record<string, unknown> | null>(),
    conversationIds: jsonb('conversation_ids').$type<string[]>().default([]),
    attemptNumber: integer('attempt_number').notNull().default(1),
    idempotencyKey: varchar('idempotency_key', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    uniqueIndex('sched_invocations_idempotency_idx').on(table.idempotencyKey),
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

// ============================================================================
// Work App TABLES
// ============================================================================

/**
 * Tracks GitHub App installations linked to tenants.
 * One tenant can have multiple installations (e.g., multiple orgs).
 * The installation_id is the GitHub-assigned ID, unique across all GitHub.
 */
export const workAppGitHubInstallations = pgTable(
  'work_app_github_installations',
  {
    ...tenantScoped,
    installationId: text('installation_id').notNull().unique(),
    accountLogin: varchar('account_login', { length: 256 }).notNull(),
    accountId: text('account_id').notNull(),
    accountType: varchar('account_type', { length: 20 })
      .$type<WorkAppGitHubAccountType>()
      .notNull(),
    status: varchar('status', { length: 20 })
      .$type<WorkAppGitHubInstallationStatus>()
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [
    index('work_app_github_installations_tenant_idx').on(table.tenantId),
    index('work_app_github_installations_installation_id_idx').on(table.installationId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_github_installations_organization_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Repositories accessible through a GitHub App installation.
 * These are synced from GitHub when the app is installed or updated.
 * The repository_id is the GitHub-assigned ID, unique across all GitHub.
 */
export const workAppGitHubRepositories = pgTable(
  'work_app_github_repositories',
  {
    id: varchar('id', { length: 256 }).primaryKey(),
    installationDbId: varchar('installation_db_id', { length: 256 }).notNull(),
    repositoryId: text('repository_id').notNull(),
    repositoryName: varchar('repository_name', { length: 256 }).notNull(),
    repositoryFullName: varchar('repository_full_name', { length: 512 }).notNull(),
    private: boolean('private').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('work_app_github_repositories_installation_idx').on(table.installationDbId),
    index('work_app_github_repositories_full_name_idx').on(table.repositoryFullName),
    unique('work_app_github_repositories_repo_installation_unique').on(
      table.installationDbId,
      table.repositoryId
    ),
    foreignKey({
      columns: [table.installationDbId],
      foreignColumns: [workAppGitHubInstallations.id],
      name: 'work_app_github_repositories_installation_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Links projects to specific GitHub repositories for fine-grained access control.
 * When a project has entries here, only the listed repositories are accessible.
 * When no entries exist for a project, all tenant repositories are accessible (mode='all').
 * The tenant_id and project_id reference the projects table in the manage schema
 * (cross-schema, no FK constraint for project). tenant_id is included because
 * project IDs are only unique within a tenant.
 */
export const workAppGitHubProjectRepositoryAccess = pgTable(
  'work_app_github_project_repository_access',
  {
    ...projectScoped,
    repositoryDbId: varchar('repository_db_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('work_app_github_project_repository_access_tenant_idx').on(table.tenantId),
    index('work_app_github_project_repository_access_project_idx').on(table.projectId),
    unique('work_app_github_project_repository_access_unique').on(
      table.tenantId,
      table.projectId,
      table.repositoryDbId
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_github_project_repository_access_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.repositoryDbId],
      foreignColumns: [workAppGitHubRepositories.id],
      name: 'work_app_github_project_repository_access_repo_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Links MCP tools to specific GitHub repositories for repository-scoped access.
 * When an MCP tool has entries here, only the listed repositories are accessible to that tool.
 * The tool_id, tenant_id, and project_id reference the tools table in the manage schema
 * (cross-schema, no FK constraint). These are denormalized here so all GitHub access
 * info can be queried from PostgreSQL alone.
 */
export const workAppGitHubMcpToolRepositoryAccess = pgTable(
  'work_app_github_mcp_tool_repository_access',
  {
    ...projectScoped,
    toolId: varchar('tool_id', { length: 256 }).notNull(),
    repositoryDbId: varchar('repository_db_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('work_app_github_mcp_tool_repository_access_tool_idx').on(table.toolId),
    index('work_app_github_mcp_tool_repository_access_tenant_idx').on(table.tenantId),
    index('work_app_github_mcp_tool_repository_access_project_idx').on(table.projectId),
    unique('work_app_github_mcp_tool_repository_access_unique').on(
      table.toolId,
      table.repositoryDbId
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_github_mcp_tool_repository_access_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.repositoryDbId],
      foreignColumns: [workAppGitHubRepositories.id],
      name: 'work_app_github_mcp_tool_repository_access_repo_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Stores the explicit access mode for project-level GitHub repository access.
 * - 'all': Project has access to all repositories from tenant GitHub installations
 * - 'selected': Project only has access to repositories listed in work_app_github_project_repository_access
 * If no row exists for a project, defaults to 'selected' (fail-safe: no access unless explicitly granted).
 */
export const workAppGitHubProjectAccessMode = pgTable(
  'work_app_github_project_access_mode',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    mode: varchar('mode', { length: 20 }).$type<'all' | 'selected'>().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId] }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_github_project_access_mode_tenant_fk',
    }).onDelete('cascade'),
  ]
);

/**
 * Stores the explicit access mode for MCP tool-level GitHub repository access.
 * - 'all': Tool has access to all repositories the project has access to
 * - 'selected': Tool only has access to repositories listed in work_app_github_mcp_tool_repository_access
 * If no row exists for a tool, defaults to 'selected' (fail-safe: no access unless explicitly granted).
 */
export const workAppGitHubMcpToolAccessMode = pgTable(
  'work_app_github_mcp_tool_access_mode',
  {
    toolId: varchar('tool_id', { length: 256 }).notNull(),
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    mode: varchar('mode', { length: 20 }).$type<'all' | 'selected'>().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.toolId] }),
    index('work_app_github_mcp_tool_access_mode_tenant_idx').on(table.tenantId),
    index('work_app_github_mcp_tool_access_mode_project_idx').on(table.projectId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_github_mcp_tool_access_mode_tenant_fk',
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// GITHUB APP INSTALLATION RELATIONS
// ============================================================================

export const workAppGitHubInstallationsRelations = relations(
  workAppGitHubInstallations,
  ({ many }) => ({
    repositories: many(workAppGitHubRepositories),
  })
);

export const workAppGitHubRepositoriesRelations = relations(
  workAppGitHubRepositories,
  ({ one, many }) => ({
    installation: one(workAppGitHubInstallations, {
      fields: [workAppGitHubRepositories.installationDbId],
      references: [workAppGitHubInstallations.id],
    }),
    projectAccess: many(workAppGitHubProjectRepositoryAccess),
    mcpToolAccess: many(workAppGitHubMcpToolRepositoryAccess),
  })
);

export const workAppGitHubProjectRepositoryAccessRelations = relations(
  workAppGitHubProjectRepositoryAccess,
  ({ one }) => ({
    repository: one(workAppGitHubRepositories, {
      fields: [workAppGitHubProjectRepositoryAccess.repositoryDbId],
      references: [workAppGitHubRepositories.id],
    }),
  })
);

export const workAppGitHubMcpToolRepositoryAccessRelations = relations(
  workAppGitHubMcpToolRepositoryAccess,
  ({ one }) => ({
    repository: one(workAppGitHubRepositories, {
      fields: [workAppGitHubMcpToolRepositoryAccess.repositoryDbId],
      references: [workAppGitHubRepositories.id],
    }),
  })
);
