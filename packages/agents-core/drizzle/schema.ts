import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, varchar } from "drizzle-orm/pg-core"



export const apiKeys = pgTable("api_keys", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	publicId: varchar("public_id", { length: 256 }).notNull(),
	keyHash: varchar("key_hash", { length: 256 }).notNull(),
	keyPrefix: varchar("key_prefix", { length: 256 }).notNull(),
	name: varchar({ length: 256 }),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("api_keys_prefix_idx").using("btree", table.keyPrefix.asc().nullsLast().op("text_ops")),
	index("api_keys_public_id_idx").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
	index("api_keys_tenant_agent_idx").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.agentId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "api_keys_project_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "api_keys_agent_fk"
		}).onDelete("cascade"),
	unique("api_keys_public_id_unique").on(table.publicId),
	check("api_keys_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("api_keys_id_not_null", sql`NOT NULL id`),
	check("api_keys_project_id_not_null", sql`NOT NULL project_id`),
	check("api_keys_agent_id_not_null", sql`NOT NULL agent_id`),
	check("api_keys_public_id_not_null", sql`NOT NULL public_id`),
	check("api_keys_key_hash_not_null", sql`NOT NULL key_hash`),
	check("api_keys_key_prefix_not_null", sql`NOT NULL key_prefix`),
	check("api_keys_created_at_not_null", sql`NOT NULL created_at`),
	check("api_keys_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentArtifactComponents = pgTable("sub_agent_artifact_components", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	artifactComponentId: varchar("artifact_component_id", { length: 256 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_artifact_components_sub_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.artifactComponentId],
			foreignColumns: [artifactComponents.tenantId, artifactComponents.id, artifactComponents.projectId],
			name: "sub_agent_artifact_components_artifact_component_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.subAgentId, table.projectId, table.id, table.agentId], name: "sub_agent_artifact_components_tenant_id_project_id_agent_id_sub"}),
	check("sub_agent_artifact_components_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_artifact_components_id_not_null", sql`NOT NULL id`),
	check("sub_agent_artifact_components_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_artifact_components_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_artifact_components_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_artifact_components_artifact_component_id_not_null", sql`NOT NULL artifact_component_id`),
	check("sub_agent_artifact_components_created_at_not_null", sql`NOT NULL created_at`),
]);

export const subAgentDataComponents = pgTable("sub_agent_data_components", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	dataComponentId: varchar("data_component_id", { length: 256 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_data_components_sub_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.dataComponentId],
			foreignColumns: [dataComponents.tenantId, dataComponents.id, dataComponents.projectId],
			name: "sub_agent_data_components_data_component_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "sub_agent_data_components_tenant_id_project_id_id_pk"}),
	check("sub_agent_data_components_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_data_components_id_not_null", sql`NOT NULL id`),
	check("sub_agent_data_components_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_data_components_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_data_components_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_data_components_data_component_id_not_null", sql`NOT NULL data_component_id`),
	check("sub_agent_data_components_created_at_not_null", sql`NOT NULL created_at`),
]);

export const projects = pgTable("projects", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text().notNull(),
	models: jsonb(),
	stopWhen: jsonb("stop_when"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.tenantId, table.id], name: "projects_tenant_id_id_pk"}),
	check("projects_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("projects_id_not_null", sql`NOT NULL id`),
	check("projects_name_not_null", sql`NOT NULL name`),
	check("projects_description_not_null", sql`NOT NULL description`),
	check("projects_created_at_not_null", sql`NOT NULL created_at`),
	check("projects_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const artifactComponents = pgTable("artifact_components", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text().notNull(),
	props: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "artifact_components_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "artifact_components_tenant_id_project_id_id_pk"}),
	check("artifact_components_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("artifact_components_id_not_null", sql`NOT NULL id`),
	check("artifact_components_project_id_not_null", sql`NOT NULL project_id`),
	check("artifact_components_name_not_null", sql`NOT NULL name`),
	check("artifact_components_description_not_null", sql`NOT NULL description`),
	check("artifact_components_created_at_not_null", sql`NOT NULL created_at`),
	check("artifact_components_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const contextConfigs = pgTable("context_configs", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	headersSchema: jsonb("headers_schema"),
	contextVariables: jsonb("context_variables"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "context_configs_agent_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "context_configs_tenant_id_project_id_agent_id_id_pk"}),
	check("context_configs_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("context_configs_id_not_null", sql`NOT NULL id`),
	check("context_configs_project_id_not_null", sql`NOT NULL project_id`),
	check("context_configs_agent_id_not_null", sql`NOT NULL agent_id`),
	check("context_configs_created_at_not_null", sql`NOT NULL created_at`),
	check("context_configs_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const functions = pgTable("functions", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	inputSchema: jsonb("input_schema"),
	executeCode: text("execute_code").notNull(),
	dependencies: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "functions_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "functions_tenant_id_project_id_id_pk"}),
	check("functions_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("functions_id_not_null", sql`NOT NULL id`),
	check("functions_project_id_not_null", sql`NOT NULL project_id`),
	check("functions_execute_code_not_null", sql`NOT NULL execute_code`),
	check("functions_created_at_not_null", sql`NOT NULL created_at`),
	check("functions_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentFunctionToolRelations = pgTable("sub_agent_function_tool_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	functionToolId: varchar("function_tool_id", { length: 256 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_function_tool_relations_sub_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.functionToolId],
			foreignColumns: [functionTools.tenantId, functionTools.id, functionTools.projectId, functionTools.agentId],
			name: "sub_agent_function_tool_relations_function_tool_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agent_function_tool_relations_tenant_id_project_id_agent_id"}),
	check("sub_agent_function_tool_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_function_tool_relations_id_not_null", sql`NOT NULL id`),
	check("sub_agent_function_tool_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_function_tool_relations_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_function_tool_relations_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_function_tool_relations_function_tool_id_not_null", sql`NOT NULL function_tool_id`),
	check("sub_agent_function_tool_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agent_function_tool_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const taskRelations = pgTable("task_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	parentTaskId: varchar("parent_task_id", { length: 256 }).notNull(),
	childTaskId: varchar("child_task_id", { length: 256 }).notNull(),
	relationType: varchar("relation_type", { length: 256 }).default('parent_child'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "task_relations_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "task_relations_tenant_id_project_id_id_pk"}),
	check("task_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("task_relations_id_not_null", sql`NOT NULL id`),
	check("task_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("task_relations_parent_task_id_not_null", sql`NOT NULL parent_task_id`),
	check("task_relations_child_task_id_not_null", sql`NOT NULL child_task_id`),
	check("task_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("task_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const credentialReferences = pgTable("credential_references", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	type: varchar({ length: 256 }).notNull(),
	credentialStoreId: varchar("credential_store_id", { length: 256 }).notNull(),
	retrievalParams: jsonb("retrieval_params"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "credential_references_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "credential_references_tenant_id_project_id_id_pk"}),
	check("credential_references_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("credential_references_id_not_null", sql`NOT NULL id`),
	check("credential_references_project_id_not_null", sql`NOT NULL project_id`),
	check("credential_references_name_not_null", sql`NOT NULL name`),
	check("credential_references_type_not_null", sql`NOT NULL type`),
	check("credential_references_credential_store_id_not_null", sql`NOT NULL credential_store_id`),
	check("credential_references_created_at_not_null", sql`NOT NULL created_at`),
	check("credential_references_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const dataComponents = pgTable("data_components", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text().notNull(),
	props: jsonb(),
	render: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "data_components_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "data_components_tenant_id_project_id_id_pk"}),
	check("data_components_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("data_components_id_not_null", sql`NOT NULL id`),
	check("data_components_project_id_not_null", sql`NOT NULL project_id`),
	check("data_components_name_not_null", sql`NOT NULL name`),
	check("data_components_description_not_null", sql`NOT NULL description`),
	check("data_components_created_at_not_null", sql`NOT NULL created_at`),
	check("data_components_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const externalAgents = pgTable("external_agents", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text().notNull(),
	baseUrl: text("base_url").notNull(),
	credentialReferenceId: varchar("credential_reference_id", { length: 256 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "external_agents_project_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.credentialReferenceId],
			foreignColumns: [credentialReferences.tenantId, credentialReferences.id, credentialReferences.projectId],
			name: "external_agents_credential_reference_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "external_agents_tenant_id_project_id_id_pk"}),
	check("external_agents_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("external_agents_id_not_null", sql`NOT NULL id`),
	check("external_agents_project_id_not_null", sql`NOT NULL project_id`),
	check("external_agents_name_not_null", sql`NOT NULL name`),
	check("external_agents_description_not_null", sql`NOT NULL description`),
	check("external_agents_base_url_not_null", sql`NOT NULL base_url`),
	check("external_agents_created_at_not_null", sql`NOT NULL created_at`),
	check("external_agents_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const functionTools = pgTable("function_tools", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text(),
	functionId: varchar("function_id", { length: 256 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "function_tools_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.functionId],
			foreignColumns: [functions.tenantId, functions.id, functions.projectId],
			name: "function_tools_function_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "function_tools_tenant_id_project_id_agent_id_id_pk"}),
	check("function_tools_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("function_tools_id_not_null", sql`NOT NULL id`),
	check("function_tools_project_id_not_null", sql`NOT NULL project_id`),
	check("function_tools_agent_id_not_null", sql`NOT NULL agent_id`),
	check("function_tools_name_not_null", sql`NOT NULL name`),
	check("function_tools_function_id_not_null", sql`NOT NULL function_id`),
	check("function_tools_created_at_not_null", sql`NOT NULL created_at`),
	check("function_tools_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentExternalAgentRelations = pgTable("sub_agent_external_agent_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	externalAgentId: varchar("external_agent_id", { length: 256 }).notNull(),
	headers: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_external_agent_relations_sub_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.externalAgentId],
			foreignColumns: [externalAgents.tenantId, externalAgents.id, externalAgents.projectId],
			name: "sub_agent_external_agent_relations_external_agent_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agent_external_agent_relations_tenant_id_project_id_agent_i"}),
	check("sub_agent_external_agent_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_external_agent_relations_id_not_null", sql`NOT NULL id`),
	check("sub_agent_external_agent_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_external_agent_relations_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_external_agent_relations_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_external_agent_relations_external_agent_id_not_null", sql`NOT NULL external_agent_id`),
	check("sub_agent_external_agent_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agent_external_agent_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentRelations = pgTable("sub_agent_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	sourceSubAgentId: varchar("source_sub_agent_id", { length: 256 }).notNull(),
	targetSubAgentId: varchar("target_sub_agent_id", { length: 256 }),
	relationType: varchar("relation_type", { length: 256 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "sub_agent_relations_agent_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agent_relations_tenant_id_project_id_agent_id_id_pk"}),
	check("sub_agent_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_relations_id_not_null", sql`NOT NULL id`),
	check("sub_agent_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_relations_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_relations_source_sub_agent_id_not_null", sql`NOT NULL source_sub_agent_id`),
	check("sub_agent_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agent_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentTeamAgentRelations = pgTable("sub_agent_team_agent_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	targetAgentId: varchar("target_agent_id", { length: 256 }).notNull(),
	headers: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_team_agent_relations_sub_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.targetAgentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "sub_agent_team_agent_relations_target_agent_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agent_team_agent_relations_tenant_id_project_id_agent_id_id"}),
	check("sub_agent_team_agent_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_team_agent_relations_id_not_null", sql`NOT NULL id`),
	check("sub_agent_team_agent_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_team_agent_relations_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_team_agent_relations_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_team_agent_relations_target_agent_id_not_null", sql`NOT NULL target_agent_id`),
	check("sub_agent_team_agent_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agent_team_agent_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const conversations = pgTable("conversations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	userId: varchar("user_id", { length: 256 }),
	activeSubAgentId: varchar("active_sub_agent_id", { length: 256 }).notNull(),
	title: text(),
	lastContextResolution: timestamp("last_context_resolution", { mode: 'string' }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "conversations_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "conversations_tenant_id_project_id_id_pk"}),
	check("conversations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("conversations_id_not_null", sql`NOT NULL id`),
	check("conversations_project_id_not_null", sql`NOT NULL project_id`),
	check("conversations_active_sub_agent_id_not_null", sql`NOT NULL active_sub_agent_id`),
	check("conversations_created_at_not_null", sql`NOT NULL created_at`),
	check("conversations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgentToolRelations = pgTable("sub_agent_tool_relations", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	toolId: varchar("tool_id", { length: 256 }).notNull(),
	selectedTools: jsonb("selected_tools"),
	headers: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "sub_agent_tool_relations_agent_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId, table.projectId, table.toolId],
			foreignColumns: [tools.tenantId, tools.id, tools.projectId],
			name: "sub_agent_tool_relations_tool_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agent_tool_relations_tenant_id_project_id_agent_id_id_pk"}),
	check("sub_agent_tool_relations_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agent_tool_relations_id_not_null", sql`NOT NULL id`),
	check("sub_agent_tool_relations_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agent_tool_relations_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agent_tool_relations_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("sub_agent_tool_relations_tool_id_not_null", sql`NOT NULL tool_id`),
	check("sub_agent_tool_relations_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agent_tool_relations_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const tasks = pgTable("tasks", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	subAgentId: varchar("sub_agent_id", { length: 256 }).notNull(),
	contextId: varchar("context_id", { length: 256 }).notNull(),
	status: varchar({ length: 256 }).notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId, table.subAgentId],
			foreignColumns: [subAgents.tenantId, subAgents.id, subAgents.projectId, subAgents.agentId],
			name: "tasks_sub_agent_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "tasks_tenant_id_project_id_id_pk"}),
	check("tasks_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("tasks_id_not_null", sql`NOT NULL id`),
	check("tasks_project_id_not_null", sql`NOT NULL project_id`),
	check("tasks_agent_id_not_null", sql`NOT NULL agent_id`),
	check("tasks_sub_agent_id_not_null", sql`NOT NULL sub_agent_id`),
	check("tasks_context_id_not_null", sql`NOT NULL context_id`),
	check("tasks_status_not_null", sql`NOT NULL status`),
	check("tasks_created_at_not_null", sql`NOT NULL created_at`),
	check("tasks_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const subAgents = pgTable("sub_agents", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	agentId: varchar("agent_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text().notNull(),
	prompt: text().notNull(),
	conversationHistoryConfig: jsonb("conversation_history_config"),
	models: jsonb(),
	stopWhen: jsonb("stop_when"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId, table.agentId],
			foreignColumns: [agent.tenantId, agent.id, agent.projectId],
			name: "sub_agents_agents_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id, table.agentId], name: "sub_agents_tenant_id_project_id_agent_id_id_pk"}),
	check("sub_agents_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("sub_agents_id_not_null", sql`NOT NULL id`),
	check("sub_agents_project_id_not_null", sql`NOT NULL project_id`),
	check("sub_agents_agent_id_not_null", sql`NOT NULL agent_id`),
	check("sub_agents_name_not_null", sql`NOT NULL name`),
	check("sub_agents_description_not_null", sql`NOT NULL description`),
	check("sub_agents_prompt_not_null", sql`NOT NULL prompt`),
	check("sub_agents_created_at_not_null", sql`NOT NULL created_at`),
	check("sub_agents_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const agent = pgTable("agent", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text(),
	defaultSubAgentId: varchar("default_sub_agent_id", { length: 256 }),
	contextConfigId: varchar("context_config_id", { length: 256 }),
	models: jsonb(),
	statusUpdates: jsonb("status_updates"),
	prompt: text(),
	stopWhen: jsonb("stop_when"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "agent_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "agent_tenant_id_project_id_id_pk"}),
	check("agent_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("agent_id_not_null", sql`NOT NULL id`),
	check("agent_project_id_not_null", sql`NOT NULL project_id`),
	check("agent_name_not_null", sql`NOT NULL name`),
	check("agent_created_at_not_null", sql`NOT NULL created_at`),
	check("agent_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const contextCache = pgTable("context_cache", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	conversationId: varchar("conversation_id", { length: 256 }).notNull(),
	contextConfigId: varchar("context_config_id", { length: 256 }).notNull(),
	contextVariableKey: varchar("context_variable_key", { length: 256 }).notNull(),
	value: jsonb().notNull(),
	requestHash: varchar("request_hash", { length: 256 }),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
	fetchSource: varchar("fetch_source", { length: 256 }),
	fetchDurationMs: integer("fetch_duration_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("context_cache_lookup_idx").using("btree", table.conversationId.asc().nullsLast().op("text_ops"), table.contextConfigId.asc().nullsLast().op("text_ops"), table.contextVariableKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "context_cache_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "context_cache_tenant_id_project_id_id_pk"}),
	check("context_cache_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("context_cache_id_not_null", sql`NOT NULL id`),
	check("context_cache_project_id_not_null", sql`NOT NULL project_id`),
	check("context_cache_conversation_id_not_null", sql`NOT NULL conversation_id`),
	check("context_cache_context_config_id_not_null", sql`NOT NULL context_config_id`),
	check("context_cache_context_variable_key_not_null", sql`NOT NULL context_variable_key`),
	check("context_cache_value_not_null", sql`NOT NULL value`),
	check("context_cache_fetched_at_not_null", sql`NOT NULL fetched_at`),
	check("context_cache_created_at_not_null", sql`NOT NULL created_at`),
	check("context_cache_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const tools = pgTable("tools", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: text(),
	config: jsonb().notNull(),
	credentialReferenceId: varchar("credential_reference_id", { length: 256 }),
	headers: jsonb(),
	imageUrl: text("image_url"),
	capabilities: jsonb(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "tools_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "tools_tenant_id_project_id_id_pk"}),
	check("tools_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("tools_id_not_null", sql`NOT NULL id`),
	check("tools_project_id_not_null", sql`NOT NULL project_id`),
	check("tools_name_not_null", sql`NOT NULL name`),
	check("tools_config_not_null", sql`NOT NULL config`),
	check("tools_created_at_not_null", sql`NOT NULL created_at`),
	check("tools_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const ledgerArtifacts = pgTable("ledger_artifacts", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	taskId: varchar("task_id", { length: 256 }).notNull(),
	toolCallId: varchar("tool_call_id", { length: 256 }),
	contextId: varchar("context_id", { length: 256 }).notNull(),
	type: varchar({ length: 256 }).default('source').notNull(),
	name: varchar({ length: 256 }),
	description: text(),
	parts: jsonb(),
	metadata: jsonb(),
	summary: text(),
	mime: jsonb(),
	visibility: varchar({ length: 256 }).default('context'),
	allowedAgents: jsonb("allowed_agents"),
	derivedFrom: varchar("derived_from", { length: 256 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ledger_artifacts_context_id_idx").using("btree", table.contextId.asc().nullsLast().op("text_ops")),
	index("ledger_artifacts_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("ledger_artifacts_tool_call_id_idx").using("btree", table.toolCallId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "ledger_artifacts_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.taskId, table.projectId, table.id], name: "ledger_artifacts_tenant_id_project_id_id_task_id_pk"}),
	unique("ledger_artifacts_task_context_name_unique").on(table.taskId, table.name, table.contextId),
	check("ledger_artifacts_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("ledger_artifacts_id_not_null", sql`NOT NULL id`),
	check("ledger_artifacts_project_id_not_null", sql`NOT NULL project_id`),
	check("ledger_artifacts_task_id_not_null", sql`NOT NULL task_id`),
	check("ledger_artifacts_context_id_not_null", sql`NOT NULL context_id`),
	check("ledger_artifacts_type_not_null", sql`NOT NULL type`),
	check("ledger_artifacts_created_at_not_null", sql`NOT NULL created_at`),
	check("ledger_artifacts_updated_at_not_null", sql`NOT NULL updated_at`),
]);

export const messages = pgTable("messages", {
	tenantId: varchar("tenant_id", { length: 256 }).notNull(),
	id: varchar({ length: 256 }).notNull(),
	projectId: varchar("project_id", { length: 256 }).notNull(),
	conversationId: varchar("conversation_id", { length: 256 }).notNull(),
	role: varchar({ length: 256 }).notNull(),
	fromSubAgentId: varchar("from_sub_agent_id", { length: 256 }),
	toSubAgentId: varchar("to_sub_agent_id", { length: 256 }),
	fromExternalSubAgentId: varchar("from_external_sub_agent_id", { length: 256 }),
	toExternalSubAgentId: varchar("to_external_sub_agent_id", { length: 256 }),
	fromTeamAgentId: varchar("from_team_agent_id", { length: 256 }),
	toTeamAgentId: varchar("to_team_agent_id", { length: 256 }),
	content: jsonb().notNull(),
	visibility: varchar({ length: 256 }).default('user-facing').notNull(),
	messageType: varchar("message_type", { length: 256 }).default('chat').notNull(),
	taskId: varchar("task_id", { length: 256 }),
	parentMessageId: varchar("parent_message_id", { length: 256 }),
	a2ATaskId: varchar("a2a_task_id", { length: 256 }),
	a2ASessionId: varchar("a2a_session_id", { length: 256 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId, table.projectId],
			foreignColumns: [projects.tenantId, projects.id],
			name: "messages_project_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.projectId, table.id], name: "messages_tenant_id_project_id_id_pk"}),
	check("messages_tenant_id_not_null", sql`NOT NULL tenant_id`),
	check("messages_id_not_null", sql`NOT NULL id`),
	check("messages_project_id_not_null", sql`NOT NULL project_id`),
	check("messages_conversation_id_not_null", sql`NOT NULL conversation_id`),
	check("messages_role_not_null", sql`NOT NULL role`),
	check("messages_content_not_null", sql`NOT NULL content`),
	check("messages_visibility_not_null", sql`NOT NULL visibility`),
	check("messages_message_type_not_null", sql`NOT NULL message_type`),
	check("messages_created_at_not_null", sql`NOT NULL created_at`),
	check("messages_updated_at_not_null", sql`NOT NULL updated_at`),
]);
