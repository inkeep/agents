import { relations } from "drizzle-orm/relations";
import { agent, apiKeys, artifactComponents, contextCache, contextConfigs, conversations, credentialReferences, dataComponents, externalAgents, functions, functionTools, ledgerArtifacts, messages, projects, subAgentArtifactComponents, subAgentDataComponents, subAgentExternalAgentRelations, subAgentFunctionToolRelations, subAgentRelations, subAgents, subAgentTeamAgentRelations, subAgentToolRelations, taskRelations, tasks, tools } from "./schema";

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	project: one(projects, {
		fields: [apiKeys.tenantId],
		references: [projects.tenantId]
	}),
	agent: one(agent, {
		fields: [apiKeys.tenantId],
		references: [agent.tenantId]
	}),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	apiKeys: many(apiKeys),
	artifactComponents: many(artifactComponents),
	functions: many(functions),
	taskRelations: many(taskRelations),
	credentialReferences: many(credentialReferences),
	dataComponents: many(dataComponents),
	externalAgents: many(externalAgents),
	conversations: many(conversations),
	agents: many(agent),
	contextCaches: many(contextCache),
	tools: many(tools),
	ledgerArtifacts: many(ledgerArtifacts),
	messages: many(messages),
}));

export const agentRelations = relations(agent, ({one, many}) => ({
	apiKeys: many(apiKeys),
	contextConfigs: many(contextConfigs),
	functionTools: many(functionTools),
	subAgentRelations: many(subAgentRelations),
	subAgentTeamAgentRelations: many(subAgentTeamAgentRelations),
	subAgents: many(subAgents),
	project: one(projects, {
		fields: [agent.tenantId],
		references: [projects.tenantId]
	}),
}));

export const subAgentArtifactComponentsRelations = relations(subAgentArtifactComponents, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentArtifactComponents.tenantId],
		references: [subAgents.tenantId]
	}),
	artifactComponent: one(artifactComponents, {
		fields: [subAgentArtifactComponents.tenantId],
		references: [artifactComponents.tenantId]
	}),
}));

export const subAgentsRelations = relations(subAgents, ({one, many}) => ({
	subAgentArtifactComponents: many(subAgentArtifactComponents),
	subAgentDataComponents: many(subAgentDataComponents),
	subAgentFunctionToolRelations: many(subAgentFunctionToolRelations),
	subAgentExternalAgentRelations: many(subAgentExternalAgentRelations),
	subAgentTeamAgentRelations: many(subAgentTeamAgentRelations),
	subAgentToolRelations: many(subAgentToolRelations),
	tasks: many(tasks),
	agent: one(agent, {
		fields: [subAgents.tenantId],
		references: [agent.tenantId]
	}),
}));

export const artifactComponentsRelations = relations(artifactComponents, ({one, many}) => ({
	subAgentArtifactComponents: many(subAgentArtifactComponents),
	project: one(projects, {
		fields: [artifactComponents.tenantId],
		references: [projects.tenantId]
	}),
}));

export const subAgentDataComponentsRelations = relations(subAgentDataComponents, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentDataComponents.tenantId],
		references: [subAgents.tenantId]
	}),
	dataComponent: one(dataComponents, {
		fields: [subAgentDataComponents.tenantId],
		references: [dataComponents.tenantId]
	}),
}));

export const dataComponentsRelations = relations(dataComponents, ({one, many}) => ({
	subAgentDataComponents: many(subAgentDataComponents),
	project: one(projects, {
		fields: [dataComponents.tenantId],
		references: [projects.tenantId]
	}),
}));

export const contextConfigsRelations = relations(contextConfigs, ({one}) => ({
	agent: one(agent, {
		fields: [contextConfigs.tenantId],
		references: [agent.tenantId]
	}),
}));

export const functionsRelations = relations(functions, ({one, many}) => ({
	project: one(projects, {
		fields: [functions.tenantId],
		references: [projects.tenantId]
	}),
	functionTools: many(functionTools),
}));

export const subAgentFunctionToolRelationsRelations = relations(subAgentFunctionToolRelations, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentFunctionToolRelations.tenantId],
		references: [subAgents.tenantId]
	}),
	functionTool: one(functionTools, {
		fields: [subAgentFunctionToolRelations.tenantId],
		references: [functionTools.tenantId]
	}),
}));

export const functionToolsRelations = relations(functionTools, ({one, many}) => ({
	subAgentFunctionToolRelations: many(subAgentFunctionToolRelations),
	agent: one(agent, {
		fields: [functionTools.tenantId],
		references: [agent.tenantId]
	}),
	function: one(functions, {
		fields: [functionTools.tenantId],
		references: [functions.tenantId]
	}),
}));

export const taskRelationsRelations = relations(taskRelations, ({one}) => ({
	project: one(projects, {
		fields: [taskRelations.tenantId],
		references: [projects.tenantId]
	}),
}));

export const credentialReferencesRelations = relations(credentialReferences, ({one, many}) => ({
	project: one(projects, {
		fields: [credentialReferences.tenantId],
		references: [projects.tenantId]
	}),
	externalAgents: many(externalAgents),
}));

export const externalAgentsRelations = relations(externalAgents, ({one, many}) => ({
	project: one(projects, {
		fields: [externalAgents.tenantId],
		references: [projects.tenantId]
	}),
	credentialReference: one(credentialReferences, {
		fields: [externalAgents.tenantId],
		references: [credentialReferences.tenantId]
	}),
	subAgentExternalAgentRelations: many(subAgentExternalAgentRelations),
}));

export const subAgentExternalAgentRelationsRelations = relations(subAgentExternalAgentRelations, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentExternalAgentRelations.tenantId],
		references: [subAgents.tenantId]
	}),
	externalAgent: one(externalAgents, {
		fields: [subAgentExternalAgentRelations.tenantId],
		references: [externalAgents.tenantId]
	}),
}));

export const subAgentRelationsRelations = relations(subAgentRelations, ({one}) => ({
	agent: one(agent, {
		fields: [subAgentRelations.tenantId],
		references: [agent.tenantId]
	}),
}));

export const subAgentTeamAgentRelationsRelations = relations(subAgentTeamAgentRelations, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentTeamAgentRelations.tenantId],
		references: [subAgents.tenantId]
	}),
	agent: one(agent, {
		fields: [subAgentTeamAgentRelations.tenantId],
		references: [agent.tenantId]
	}),
}));

export const conversationsRelations = relations(conversations, ({one}) => ({
	project: one(projects, {
		fields: [conversations.tenantId],
		references: [projects.tenantId]
	}),
}));

export const subAgentToolRelationsRelations = relations(subAgentToolRelations, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [subAgentToolRelations.tenantId],
		references: [subAgents.tenantId]
	}),
	tool: one(tools, {
		fields: [subAgentToolRelations.tenantId],
		references: [tools.tenantId]
	}),
}));

export const toolsRelations = relations(tools, ({one, many}) => ({
	subAgentToolRelations: many(subAgentToolRelations),
	project: one(projects, {
		fields: [tools.tenantId],
		references: [projects.tenantId]
	}),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
	subAgent: one(subAgents, {
		fields: [tasks.tenantId],
		references: [subAgents.tenantId]
	}),
}));

export const contextCacheRelations = relations(contextCache, ({one}) => ({
	project: one(projects, {
		fields: [contextCache.tenantId],
		references: [projects.tenantId]
	}),
}));

export const ledgerArtifactsRelations = relations(ledgerArtifacts, ({one}) => ({
	project: one(projects, {
		fields: [ledgerArtifacts.tenantId],
		references: [projects.tenantId]
	}),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	project: one(projects, {
		fields: [messages.tenantId],
		references: [projects.tenantId]
	}),
}));