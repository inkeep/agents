import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  ContextFetchDefinition,
  ConversationHistoryConfig,
  DatasetItemExpectedOutput,
  DatasetItemInput,
  EvaluationJobFilterCriteria,
  EvaluationSuiteFilterCriteria,
  Filter,
  Models,
  PassCriteria,
  ProjectModels,
  StatusUpdateSettings,
  ToolMcpConfig,
  ToolServerCapabilities,
} from '../../types/utility';
import type { JsonSchemaForLlmSchemaType } from '../../validation/json-schemas';
import type {
  AgentStopWhen,
  ModelSettings,
  SignatureVerificationConfig,
  SimulationAgent,
  StopWhen,
  SubAgentStopWhen,
} from '../../validation/schemas';

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
  description: text('description'),
};

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};

// ============================================================================
// CONFIG TABLES (Doltgres - Versioned)
// ============================================================================

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
    ...uiProperties,
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

export const triggers = pgTable(
  'triggers',
  {
    ...agentScoped,
    ...uiProperties,
    enabled: boolean('enabled').notNull().default(true),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown> | null>(),
    outputTransform: jsonb('output_transform').$type<{
      jmespath?: string;
      objectTransformation?: Record<string, string>;
    } | null>(),
    messageTemplate: text('message_template'),
    authentication: jsonb('authentication').$type<unknown>(),
    signingSecretCredentialReferenceId: varchar('signing_secret_credential_reference_id', {
      length: 256,
    }),
    signatureVerification: jsonb('signature_verification')
      .$type<SignatureVerificationConfig | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'triggers_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.signingSecretCredentialReferenceId],
      foreignColumns: [credentialReferences.id],
      name: 'triggers_credential_reference_fk',
    }).onDelete('set null'),
  ]
);

export const scheduledTriggers = pgTable(
  'scheduled_triggers',
  {
    ...agentScoped,
    ...uiProperties,
    enabled: boolean('enabled').notNull().default(true),
    cronExpression: varchar('cron_expression', { length: 256 }),
    runAt: timestamp('run_at', { withTimezone: true, mode: 'string' }),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    messageTemplate: text('message_template'),
    maxRetries: integer('max_retries').notNull().default(3),
    retryDelaySeconds: integer('retry_delay_seconds').notNull().default(60),
    timeoutSeconds: integer('timeout_seconds').notNull().default(300),
    workflowRunId: varchar('workflow_run_id', { length: 256 }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId],
      foreignColumns: [agents.tenantId, agents.projectId, agents.id],
      name: 'scheduled_triggers_agent_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgents = pgTable(
  'sub_agents',
  {
    ...agentScoped,
    ...uiProperties,
    prompt: text('prompt'),
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

export const skills = pgTable(
  'skills',
  {
    ...projectScoped,
    // Should be same as skill name
    id: varchar('id', { length: 64 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, string> | null>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'skills_project_fk',
    }).onDelete('cascade'),
  ]
);

export const subAgentSkills = pgTable(
  'sub_agent_skills',
  {
    ...subAgentScoped,
    skillId: varchar('skill_id', { length: 64 }).notNull(),
    // TODO: integer() always returns NaN
    index: numeric({ mode: 'number' }).notNull().default(0),
    alwaysLoaded: boolean('always_loaded').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
      foreignColumns: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
      name: 'sub_agent_skills_sub_agent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.skillId],
      foreignColumns: [skills.tenantId, skills.projectId, skills.id],
      name: 'sub_agent_skills_skill_fk',
    }).onDelete('cascade'),
    unique('sub_agent_skills_sub_agent_skill_unique').on(table.subAgentId, table.skillId),
    index('sub_agent_skills_skill_idx').on(table.skillId),
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
      columns: [table.credentialReferenceId],
      foreignColumns: [credentialReferences.id],
      name: 'external_agents_credential_reference_fk',
    }).onDelete('set null'),
  ]
);

export const dataComponents = pgTable(
  'data_components',
  {
    ...projectScoped,
    ...uiProperties,
    props: jsonb('props').$type<JsonSchemaForLlmSchemaType>().notNull(),
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
    props: jsonb('props').$type<JsonSchemaForLlmSchemaType>(),
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
    ...uiProperties,
    config: jsonb('config')
      .$type<{
        type: 'mcp';
        mcp: ToolMcpConfig;
      }>()
      .notNull(),
    credentialReferenceId: varchar('credential_reference_id', { length: 256 }),
    credentialScope: varchar('credential_scope', { length: 50 }).notNull().default('project'), // 'project' | 'user'
    headers: jsonb('headers').$type<Record<string, string>>(),
    imageUrl: text('image_url'),
    capabilities: jsonb('capabilities').$type<ToolServerCapabilities>(),
    lastError: text('last_error'),
    isWorkApp: boolean('is_work_app').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'tools_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.credentialReferenceId],
      foreignColumns: [credentialReferences.id],
      name: 'tools_credential_reference_fk',
    }).onDelete('set null'),
  ]
);

export const functionTools = pgTable(
  'function_tools',
  {
    ...agentScoped,
    ...uiProperties,
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
    toolPolicies: jsonb('tool_policies').$type<Record<
      string,
      { needsApproval?: boolean }
    > | null>(),
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

export const credentialReferences = pgTable(
  'credential_references',
  {
    ...projectScoped,
    name: uiProperties.name,
    type: varchar('type', { length: 256 }).notNull(),
    credentialStoreId: varchar('credential_store_id', { length: 256 }).notNull(),
    retrievalParams: jsonb('retrieval_params').$type<Record<string, unknown>>(),

    // For user-scoped credentials
    toolId: varchar('tool_id', { length: 256 }), // Links to the tool this credential is for
    userId: varchar('user_id', { length: 256 }), // User who owns this credential (null = project-scoped)
    createdBy: varchar('created_by', { length: 256 }), // User who created this credential

    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'credential_references_project_fk',
    }).onDelete('cascade'),
    // Unique constraint on id alone to support simple FK references
    // (id is globally unique via nanoid generation)
    unique('credential_references_id_unique').on(t.id),
    // One credential per user per tool (for user-scoped credentials)
    unique('credential_references_tool_user_unique').on(t.toolId, t.userId),
  ]
);

/**
 * A collection of test cases/items used for evaluation. Contains dataset items
 * that define input/output pairs for testing agents. Used for batch evaluation
 * runs where conversations are created from dataset items. Each datasetRun
 * specifies which agent to use when executing the dataset.
 *
 * one-to-many relationship with datasetItem
 *
 * Includes: name and timestamps
 */
export const dataset = pgTable(
  'dataset',
  {
    ...projectScoped,
    name: uiProperties.name,
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
    datasetId: varchar('dataset_id', { length: 256 }).notNull(),
    input: jsonb('input').$type<DatasetItemInput>().notNull(),
    expectedOutput: jsonb('expected_output').$type<DatasetItemExpectedOutput>(),
    simulationAgent: jsonb('simulation_agent').$type<SimulationAgent>(),
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

/*
 * Contains `the prompt/instructions for the evaluator, output schema for structured
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

/*
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
    datasetId: varchar('dataset_id', { length: 256 }).notNull(),
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

export const evaluationSuiteConfig = pgTable(
  'evaluation_suite_config',
  {
    ...projectScoped,
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
    evaluationSuiteConfigId: varchar('evaluation_suite_config_id', { length: 256 }).notNull(),
    evaluatorId: varchar('evaluator_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.id],
      name: 'eval_suite_cfg_evaluator_rel_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationSuiteConfigId],
      foreignColumns: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
      name: 'eval_suite_cfg_evaluator_rel_suite_cfg_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluatorId],
      foreignColumns: [evaluator.tenantId, evaluator.projectId, evaluator.id],
      name: 'eval_suite_cfg_evaluator_rel_evaluator_fk',
    }).onDelete('cascade'),
  ]
);

/**
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
    evaluationRunConfigId: varchar('evaluation_run_config_id', { length: 256 }).notNull(),
    evaluationSuiteConfigId: varchar('evaluation_suite_config_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.id],
      name: 'eval_run_cfg_eval_suite_cfg_rel_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationRunConfigId],
      foreignColumns: [
        evaluationRunConfig.tenantId,
        evaluationRunConfig.projectId,
        evaluationRunConfig.id,
      ],
      name: 'eval_run_cfg_eval_suite_rel_run_cfg_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationSuiteConfigId],
      foreignColumns: [
        evaluationSuiteConfig.tenantId,
        evaluationSuiteConfig.projectId,
        evaluationSuiteConfig.id,
      ],
      name: 'eval_run_cfg_eval_suite_rel_suite_cfg_fk',
    }).onDelete('cascade'),
  ]
);

/**
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
    evaluationJobConfigId: varchar('evaluation_job_config_id', { length: 256 }).notNull(),
    evaluatorId: varchar('evaluator_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.projectId, table.id],
      name: 'eval_job_cfg_evaluator_rel_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluationJobConfigId],
      foreignColumns: [
        evaluationJobConfig.tenantId,
        evaluationJobConfig.projectId,
        evaluationJobConfig.id,
      ],
      name: 'eval_job_cfg_evaluator_rel_job_cfg_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.evaluatorId],
      foreignColumns: [evaluator.tenantId, evaluator.projectId, evaluator.id],
      name: 'eval_job_cfg_evaluator_rel_evaluator_fk',
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// CONFIG RELATIONS
// ============================================================================

export const projectsRelations = relations(projects, ({ many }) => ({
  subAgents: many(subAgents),
  agents: many(agents),
  tools: many(tools),
  functions: many(functions),
  contextConfigs: many(contextConfigs),
  externalAgents: many(externalAgents),
  dataComponents: many(dataComponents),
  artifactComponents: many(artifactComponents),
  credentialReferences: many(credentialReferences),
  skills: many(skills),
}));

export const contextConfigsRelations = relations(contextConfigs, ({ many, one }) => ({
  project: one(projects, {
    fields: [contextConfigs.tenantId, contextConfigs.projectId],
    references: [projects.tenantId, projects.id],
  }),
  agents: many(agents),
}));

export const subAgentsRelations = relations(subAgents, ({ many, one }) => ({
  project: one(projects, {
    fields: [subAgents.tenantId, subAgents.projectId],
    references: [projects.tenantId, projects.id],
  }),
  defaultForAgents: many(agents),
  sourceRelations: many(subAgentRelations, {
    relationName: 'sourceRelations',
  }),
  targetRelations: many(subAgentRelations, {
    relationName: 'targetRelations',
  }),
  toolRelations: many(subAgentToolRelations),
  functionToolRelations: many(subAgentFunctionToolRelations),
  dataComponentRelations: many(subAgentDataComponents),
  artifactComponentRelations: many(subAgentArtifactComponents),
  skillRelations: many(subAgentSkills),
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

export const skillsRelations = relations(skills, ({ one, many }) => ({
  project: one(projects, {
    fields: [skills.tenantId, skills.projectId],
    references: [projects.tenantId, projects.id],
  }),
  subAgentRelations: many(subAgentSkills),
}));

export const subAgentSkillsRelations = relations(subAgentSkills, ({ one }) => ({
  subAgent: one(subAgents, {
    fields: [
      subAgentSkills.tenantId,
      subAgentSkills.projectId,
      subAgentSkills.agentId,
      subAgentSkills.subAgentId,
    ],
    references: [subAgents.tenantId, subAgents.projectId, subAgents.agentId, subAgents.id],
  }),
  skill: one(skills, {
    fields: [subAgentSkills.tenantId, subAgentSkills.projectId, subAgentSkills.skillId],
    references: [skills.tenantId, skills.projectId, skills.id],
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

/**
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
    datasetRunConfigId: varchar('dataset_run_config_id', { length: 256 }).notNull(),
    agentId: varchar('agent_id', { length: 256 }).notNull(),
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
