import { defineRelations } from 'drizzle-orm';
import * as schema from './manage-schema';

export const manageRelations = defineRelations(schema, (r) => ({
  projects: {
    subAgents: r.many.subAgents({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.subAgents.tenantId, r.subAgents.projectId],
    }),
    agents: r.many.agents({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.agents.tenantId, r.agents.projectId],
    }),
    tools: r.many.tools({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.tools.tenantId, r.tools.projectId],
    }),
    functions: r.many.functions({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.functions.tenantId, r.functions.projectId],
    }),
    contextConfigs: r.many.contextConfigs({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.contextConfigs.tenantId, r.contextConfigs.projectId],
    }),
    externalAgents: r.many.externalAgents({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.externalAgents.tenantId, r.externalAgents.projectId],
    }),
    dataComponents: r.many.dataComponents({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.dataComponents.tenantId, r.dataComponents.projectId],
    }),
    artifactComponents: r.many.artifactComponents({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.artifactComponents.tenantId, r.artifactComponents.projectId],
    }),
    credentialReferences: r.many.credentialReferences({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.credentialReferences.tenantId, r.credentialReferences.projectId],
    }),
    skills: r.many.skills({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.skills.tenantId, r.skills.projectId],
    }),
    skillFiles: r.many.skillFiles({
      from: [r.projects.tenantId, r.projects.id],
      to: [r.skillFiles.tenantId, r.skillFiles.projectId],
    }),
  },
  contextConfigs: {
    project: r.one.projects({
      from: [r.contextConfigs.tenantId, r.contextConfigs.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    agents: r.many.agents({
      from: r.contextConfigs.id,
      to: r.agents.contextConfigId,
    }),
  },
  subAgents: {
    project: r.one.projects({
      from: [r.subAgents.tenantId, r.subAgents.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    defaultForAgents: r.many.agents({
      from: r.subAgents.id,
      to: r.agents.defaultSubAgentId,
    }),
    sourceRelations: r.many.subAgentRelations({
      from: r.subAgents.id,
      to: r.subAgentRelations.sourceSubAgentId,
      alias: 'sourceRelations',
    }),
    targetRelations: r.many.subAgentRelations({
      from: r.subAgents.id,
      to: r.subAgentRelations.targetSubAgentId,
      alias: 'targetRelations',
    }),
    toolRelations: r.many.subAgentToolRelations({
      from: r.subAgents.id,
      to: r.subAgentToolRelations.subAgentId,
    }),
    functionToolRelations: r.many.subAgentFunctionToolRelations({
      from: r.subAgents.id,
      to: r.subAgentFunctionToolRelations.subAgentId,
    }),
    dataComponentRelations: r.many.subAgentDataComponents({
      from: r.subAgents.id,
      to: r.subAgentDataComponents.subAgentId,
    }),
    artifactComponentRelations: r.many.subAgentArtifactComponents({
      from: r.subAgents.id,
      to: r.subAgentArtifactComponents.subAgentId,
    }),
    skillRelations: r.many.subAgentSkills({
      from: [r.subAgents.tenantId, r.subAgents.projectId, r.subAgents.agentId, r.subAgents.id],
      to: [
        r.subAgentSkills.tenantId,
        r.subAgentSkills.projectId,
        r.subAgentSkills.agentId,
        r.subAgentSkills.subAgentId,
      ],
    }),
  },
  agents: {
    project: r.one.projects({
      from: [r.agents.tenantId, r.agents.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    defaultSubAgent: r.one.subAgents({
      from: r.agents.defaultSubAgentId,
      to: r.subAgents.id,
    }),
    contextConfig: r.one.contextConfigs({
      from: r.agents.contextConfigId,
      to: r.contextConfigs.id,
    }),
    functionTools: r.many.functionTools({
      from: [r.agents.tenantId, r.agents.projectId, r.agents.id],
      to: [r.functionTools.tenantId, r.functionTools.projectId, r.functionTools.agentId],
    }),
  },
  externalAgents: {
    project: r.one.projects({
      from: [r.externalAgents.tenantId, r.externalAgents.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    subAgentExternalAgentRelations: r.many.subAgentExternalAgentRelations({
      from: [r.externalAgents.tenantId, r.externalAgents.projectId, r.externalAgents.id],
      to: [
        r.subAgentExternalAgentRelations.tenantId,
        r.subAgentExternalAgentRelations.projectId,
        r.subAgentExternalAgentRelations.externalAgentId,
      ],
    }),
    credentialReference: r.one.credentialReferences({
      from: r.externalAgents.credentialReferenceId,
      to: r.credentialReferences.id,
    }),
  },
  subAgentToolRelations: {
    subAgent: r.one.subAgents({
      from: r.subAgentToolRelations.subAgentId,
      to: r.subAgents.id,
    }),
    tool: r.one.tools({
      from: r.subAgentToolRelations.toolId,
      to: r.tools.id,
    }),
  },
  credentialReferences: {
    project: r.one.projects({
      from: [r.credentialReferences.tenantId, r.credentialReferences.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    tools: r.many.tools({
      from: r.credentialReferences.id,
      to: r.tools.credentialReferenceId,
    }),
    externalAgents: r.many.externalAgents({
      from: r.credentialReferences.id,
      to: r.externalAgents.credentialReferenceId,
    }),
  },
  tools: {
    project: r.one.projects({
      from: [r.tools.tenantId, r.tools.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    subAgentRelations: r.many.subAgentToolRelations({
      from: r.tools.id,
      to: r.subAgentToolRelations.toolId,
    }),
    credentialReference: r.one.credentialReferences({
      from: r.tools.credentialReferenceId,
      to: r.credentialReferences.id,
    }),
  },
  artifactComponents: {
    project: r.one.projects({
      from: [r.artifactComponents.tenantId, r.artifactComponents.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    subAgentRelations: r.many.subAgentArtifactComponents({
      from: r.artifactComponents.id,
      to: r.subAgentArtifactComponents.artifactComponentId,
    }),
  },
  subAgentArtifactComponents: {
    subAgent: r.one.subAgents({
      from: r.subAgentArtifactComponents.subAgentId,
      to: r.subAgents.id,
    }),
    artifactComponent: r.one.artifactComponents({
      from: r.subAgentArtifactComponents.artifactComponentId,
      to: r.artifactComponents.id,
    }),
  },
  dataComponents: {
    project: r.one.projects({
      from: [r.dataComponents.tenantId, r.dataComponents.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    subAgentRelations: r.many.subAgentDataComponents({
      from: r.dataComponents.id,
      to: r.subAgentDataComponents.dataComponentId,
    }),
  },
  subAgentDataComponents: {
    subAgent: r.one.subAgents({
      from: r.subAgentDataComponents.subAgentId,
      to: r.subAgents.id,
    }),
    dataComponent: r.one.dataComponents({
      from: r.subAgentDataComponents.dataComponentId,
      to: r.dataComponents.id,
    }),
  },
  skills: {
    project: r.one.projects({
      from: [r.skills.tenantId, r.skills.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    files: r.many.skillFiles({
      from: [r.skills.tenantId, r.skills.projectId, r.skills.id],
      to: [r.skillFiles.tenantId, r.skillFiles.projectId, r.skillFiles.skillId],
    }),
    subAgentRelations: r.many.subAgentSkills({
      from: [r.skills.tenantId, r.skills.projectId, r.skills.id],
      to: [r.subAgentSkills.tenantId, r.subAgentSkills.projectId, r.subAgentSkills.skillId],
    }),
  },
  skillFiles: {
    project: r.one.projects({
      from: [r.skillFiles.tenantId, r.skillFiles.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    skill: r.one.skills({
      from: [r.skillFiles.tenantId, r.skillFiles.projectId, r.skillFiles.skillId],
      to: [r.skills.tenantId, r.skills.projectId, r.skills.id],
    }),
  },
  subAgentSkills: {
    subAgent: r.one.subAgents({
      from: [
        r.subAgentSkills.tenantId,
        r.subAgentSkills.projectId,
        r.subAgentSkills.agentId,
        r.subAgentSkills.subAgentId,
      ],
      to: [r.subAgents.tenantId, r.subAgents.projectId, r.subAgents.agentId, r.subAgents.id],
    }),
    skill: r.one.skills({
      from: [r.subAgentSkills.tenantId, r.subAgentSkills.projectId, r.subAgentSkills.skillId],
      to: [r.skills.tenantId, r.skills.projectId, r.skills.id],
    }),
  },
  functions: {
    functionTools: r.many.functionTools({
      from: [r.functions.tenantId, r.functions.projectId, r.functions.id],
      to: [r.functionTools.tenantId, r.functionTools.projectId, r.functionTools.functionId],
    }),
    project: r.one.projects({
      from: [r.functions.tenantId, r.functions.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
  },
  subAgentRelations: {
    agent: r.one.agents({
      from: r.subAgentRelations.agentId,
      to: r.agents.id,
    }),
    sourceSubAgent: r.one.subAgents({
      from: r.subAgentRelations.sourceSubAgentId,
      to: r.subAgents.id,
      alias: 'sourceRelations',
    }),
    targetSubAgent: r.one.subAgents({
      from: r.subAgentRelations.targetSubAgentId,
      to: r.subAgents.id,
      alias: 'targetRelations',
    }),
  },
  functionTools: {
    project: r.one.projects({
      from: [r.functionTools.tenantId, r.functionTools.projectId],
      to: [r.projects.tenantId, r.projects.id],
    }),
    agent: r.one.agents({
      from: [r.functionTools.tenantId, r.functionTools.projectId, r.functionTools.agentId],
      to: [r.agents.tenantId, r.agents.projectId, r.agents.id],
    }),
    function: r.one.functions({
      from: [r.functionTools.tenantId, r.functionTools.projectId, r.functionTools.functionId],
      to: [r.functions.tenantId, r.functions.projectId, r.functions.id],
    }),
    subAgentRelations: r.many.subAgentFunctionToolRelations({
      from: r.functionTools.id,
      to: r.subAgentFunctionToolRelations.functionToolId,
    }),
  },
  subAgentFunctionToolRelations: {
    subAgent: r.one.subAgents({
      from: r.subAgentFunctionToolRelations.subAgentId,
      to: r.subAgents.id,
    }),
    functionTool: r.one.functionTools({
      from: r.subAgentFunctionToolRelations.functionToolId,
      to: r.functionTools.id,
    }),
  },
  subAgentExternalAgentRelations: {
    subAgent: r.one.subAgents({
      from: [
        r.subAgentExternalAgentRelations.tenantId,
        r.subAgentExternalAgentRelations.projectId,
        r.subAgentExternalAgentRelations.agentId,
        r.subAgentExternalAgentRelations.subAgentId,
      ],
      to: [r.subAgents.tenantId, r.subAgents.projectId, r.subAgents.agentId, r.subAgents.id],
    }),
    externalAgent: r.one.externalAgents({
      from: [
        r.subAgentExternalAgentRelations.tenantId,
        r.subAgentExternalAgentRelations.projectId,
        r.subAgentExternalAgentRelations.externalAgentId,
      ],
      to: [r.externalAgents.tenantId, r.externalAgents.projectId, r.externalAgents.id],
    }),
  },
  subAgentTeamAgentRelations: {
    subAgent: r.one.subAgents({
      from: [
        r.subAgentTeamAgentRelations.tenantId,
        r.subAgentTeamAgentRelations.projectId,
        r.subAgentTeamAgentRelations.agentId,
        r.subAgentTeamAgentRelations.subAgentId,
      ],
      to: [r.subAgents.tenantId, r.subAgents.projectId, r.subAgents.agentId, r.subAgents.id],
    }),
    targetAgent: r.one.agents({
      from: [
        r.subAgentTeamAgentRelations.tenantId,
        r.subAgentTeamAgentRelations.projectId,
        r.subAgentTeamAgentRelations.targetAgentId,
      ],
      to: [r.agents.tenantId, r.agents.projectId, r.agents.id],
    }),
  },
  agentDatasetRelations: {
    agent: r.one.agents({
      from: [
        r.agentDatasetRelations.tenantId,
        r.agentDatasetRelations.projectId,
        r.agentDatasetRelations.agentId,
      ],
      to: [r.agents.tenantId, r.agents.projectId, r.agents.id],
    }),
    dataset: r.one.dataset({
      from: [
        r.agentDatasetRelations.tenantId,
        r.agentDatasetRelations.projectId,
        r.agentDatasetRelations.datasetId,
      ],
      to: [r.dataset.tenantId, r.dataset.projectId, r.dataset.id],
    }),
  },
  agentEvaluatorRelations: {
    agent: r.one.agents({
      from: [
        r.agentEvaluatorRelations.tenantId,
        r.agentEvaluatorRelations.projectId,
        r.agentEvaluatorRelations.agentId,
      ],
      to: [r.agents.tenantId, r.agents.projectId, r.agents.id],
    }),
    evaluator: r.one.evaluator({
      from: [
        r.agentEvaluatorRelations.tenantId,
        r.agentEvaluatorRelations.projectId,
        r.agentEvaluatorRelations.evaluatorId,
      ],
      to: [r.evaluator.tenantId, r.evaluator.projectId, r.evaluator.id],
    }),
  },
}));
