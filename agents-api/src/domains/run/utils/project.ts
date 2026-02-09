import type {
  AgentWithinContextOfProjectSelectWithRelationIds,
  ArtifactComponentApiSelect,
  CanDelegateToExternalAgent,
  CanDelegateToItem,
  CanRelateToInternalSubAgent,
  DataComponentApiSelect,
  ExternalAgentApiSelect,
  FullAgentSubAgentSelectWithRelationIds,
  FullProjectSelectWithRelationIds,
  ToolApiSelect,
} from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { generateDescriptionWithRelationData } from '../data/agents';

const logger = getLogger('project-helper');

/**
 * Get an agent from the project definition
 * Replaces direct database calls with lookup from pre-fetched project data
 */
export function getAgentFromProject(params: {
  project: FullProjectSelectWithRelationIds;
  agentId: string;
}): AgentWithinContextOfProjectSelectWithRelationIds | null {
  const { project, agentId } = params;

  const agent = project.agents[agentId];
  if (!agent) {
    logger.warn({ agentId }, 'Agent not found in project');
    return null;
  }

  return agent;
}

/**
 * Get a sub-agent from the project definition
 * Replaces direct database calls with lookup from pre-fetched project data
 */
export function getSubAgentFromProject(params: {
  project: FullProjectSelectWithRelationIds;
  agentId: string;
  subAgentId?: string;
}): FullAgentSubAgentSelectWithRelationIds | null {
  const { project, agentId, subAgentId } = params;

  const agent = project.agents[agentId];
  if (!agent) {
    logger.warn({ agentId }, 'Agent not found in project');
    return null;
  }

  // If no subAgentId provided, use the default sub-agent
  const targetSubAgentId = subAgentId || agent.defaultSubAgentId;
  if (!targetSubAgentId) {
    logger.warn({ agentId }, 'No default sub-agent ID configured for agent');
    return null;
  }

  const subAgent = agent.subAgents?.[targetSubAgentId];
  if (!subAgent) {
    logger.warn({ agentId, subAgentId: targetSubAgentId }, 'Sub-agent not found in project');
    return null;
  }

  return subAgent;
}

// Types for relation extraction
export type InternalRelation = {
  id: string;
  name: string;
  description: string | null;
  relationType: 'transfer' | 'delegate';
  relationId: string;
};

export type ExternalRelation = {
  externalAgent: {
    id: string;
    name: string;
    description: string | null;
    baseUrl: string;
    credentialReferenceId?: string | null;
  };
  headers?: Record<string, string> | null;
  relationId: string; // SubAgentExternalAgentRelation.id from the database
};

export type TeamRelation = {
  targetAgent: {
    id: string;
    name: string;
    description: string | null;
  };
  targetAgentId: string;
  headers?: Record<string, string> | null;
  relationId: string; // SubAgentTeamAgentRelation.id from the database
};

export type ParsedDelegateRelations = {
  internalDelegateRelations: InternalRelation[];
  externalRelations: ExternalRelation[];
  teamRelations: TeamRelation[];
};

/**
 * Extract transfer relations from a sub-agent's canTransferTo array
 * Returns sub-agents that can be transferred to with their details
 */
export function extractTransferRelations(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  canTransferTo: CanRelateToInternalSubAgent[];
}): InternalRelation[] {
  const { agent, canTransferTo } = params;

  return canTransferTo
    .map((relation) => {
      const targetSubAgent = agent.subAgents?.[relation.subAgentId];
      if (targetSubAgent) {
        return {
          id: relation.subAgentId,
          name: targetSubAgent.name,
          description: targetSubAgent.description,
          relationType: 'transfer' as const,
          relationId: relation.subAgentSubAgentRelationId,
        };
      }
      return null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Parse canDelegateTo array to separate internal, external, and team relations
 * Handles the union type of string | CanDelegateToExternalAgent | CanDelegateToTeamAgent
 */
export function parseDelegateRelations(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
  canDelegateTo: CanDelegateToItem[];
}): ParsedDelegateRelations {
  const { agent, project, canDelegateTo } = params;

  const internalDelegateRelations: InternalRelation[] = [];
  const externalRelations: ExternalRelation[] = [];
  const teamRelations: TeamRelation[] = [];

  for (const item of canDelegateTo) {
    if ('subAgentId' in item) {
      // Internal sub-agent delegation
      const targetSubAgent = agent.subAgents?.[item.subAgentId];
      if (targetSubAgent) {
        internalDelegateRelations.push({
          id: item.subAgentId,
          name: targetSubAgent.name,
          description: targetSubAgent.description,
          relationType: 'delegate',
          relationId: item.subAgentSubAgentRelationId,
        });
      }
    } else if ('externalAgentId' in item) {
      // External agent delegation
      const extAgentId = item.externalAgentId;
      const extHeaders = item.headers;
      const extRelationId = item.subAgentExternalAgentRelationId;
      const externalAgent =
        agent.externalAgents?.[extAgentId] || project.externalAgents?.[extAgentId];
      if (externalAgent) {
        externalRelations.push({
          externalAgent: {
            id: extAgentId,
            name: externalAgent.name,
            description: externalAgent.description,
            baseUrl: externalAgent.baseUrl,
            credentialReferenceId: externalAgent.credentialReferenceId,
          },
          headers: extHeaders,
          relationId: extRelationId,
        });
      }
    } else if ('agentId' in item) {
      // Team agent delegation
      const teamAgentId = item.agentId;
      const teamHeaders = item.headers;
      const teamRelationId = item.subAgentTeamAgentRelationId;
      const teamAgent = agent.teamAgents?.[teamAgentId];
      if (teamAgent) {
        teamRelations.push({
          targetAgent: {
            id: teamAgentId,
            name: teamAgent.name,
            description: teamAgent.description,
          },
          targetAgentId: teamAgentId,
          headers: teamHeaders,
          relationId: teamRelationId,
        });
      }
    }
  }

  return { internalDelegateRelations, externalRelations, teamRelations };
}

/**
 * Get all relations for a sub-agent (transfers + delegates combined)
 * Convenience function that combines extractTransferRelations and parseDelegateRelations
 */
export function getSubAgentRelations(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
  subAgent: FullAgentSubAgentSelectWithRelationIds;
}): {
  transferRelations: InternalRelation[];
  internalDelegateRelations: InternalRelation[];
  externalRelations: ExternalRelation[];
  teamRelations: TeamRelation[];
} {
  const { agent, project, subAgent } = params;

  const canTransferTo = subAgent.canTransferTo || [];
  const canDelegateTo = subAgent.canDelegateTo || [];

  const transferRelations = extractTransferRelations({ agent, canTransferTo });
  const { internalDelegateRelations, externalRelations, teamRelations } = parseDelegateRelations({
    agent,
    project,
    canDelegateTo,
  });

  return {
    transferRelations,
    internalDelegateRelations,
    externalRelations,
    teamRelations,
  };
}

// Types for tool extraction
export type ToolForAgent = {
  toolId: string;
  tool: ToolApiSelect;
  selectedTools: string[] | null | undefined;
  headers: Record<string, string> | null | undefined;
  toolPolicies: Record<string, { needsApproval?: boolean }> | null | undefined;
  relationshipId: string | undefined;
};

/**
 * Get tools for a sub-agent from their canUse array
 * Resolves tool references from both agent-level and project-level tools
 */
export function getToolsForSubAgent(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
  subAgent: FullAgentSubAgentSelectWithRelationIds;
}): ToolForAgent[] {
  const { agent, project, subAgent } = params;
  const canUse = subAgent.canUse || [];

  return canUse
    .map((canUseItem) => {
      const tool = agent.tools?.[canUseItem.toolId] || project.tools?.[canUseItem.toolId];
      if (!tool) return null;
      return {
        toolId: canUseItem.toolId,
        tool,
        selectedTools: canUseItem.toolSelection,
        headers: canUseItem.headers,
        toolPolicies: canUseItem.toolPolicies as
          | Record<string, { needsApproval?: boolean }>
          | null
          | undefined,
        relationshipId: canUseItem.agentToolRelationId,
      };
    })
    .filter((item): item is ToolForAgent => item !== null);
}

// Types for data/artifact components - using types from @inkeep/agents-core
export type DataComponentForAgent = DataComponentApiSelect;
export type ArtifactComponentForAgent = ArtifactComponentApiSelect;

/**
 * Get data components for a sub-agent
 * Resolves data component references from project-level dataComponents
 */
export function getDataComponentsForSubAgent(params: {
  project: FullProjectSelectWithRelationIds;
  subAgent: FullAgentSubAgentSelectWithRelationIds;
}): DataComponentForAgent[] {
  const { project, subAgent } = params;
  const dataComponentIds = subAgent.dataComponents || [];
  const dataComponentsMap = project.dataComponents || {};

  return dataComponentIds.map((id) => dataComponentsMap[id]).filter((c) => !!c);
}

/**
 * Get artifact components for a sub-agent
 * Resolves artifact component references from project-level artifactComponents
 */
export function getArtifactComponentsForSubAgent(params: {
  project: FullProjectSelectWithRelationIds;
  subAgent: FullAgentSubAgentSelectWithRelationIds;
}): ArtifactComponentForAgent[] {
  const { project, subAgent } = params;
  const artifactComponentIds = subAgent.artifactComponents || [];
  const artifactComponentsMap = project.artifactComponents || {};

  return artifactComponentIds.map((id) => artifactComponentsMap[id]).filter((c) => !!c);
}

// Types for target sub-agent relation lookups
export type TargetTransferRelation = {
  id: string;
  name: string;
  description: string | null;
  relationId: string;
};

export type TargetExternalAgentRelation = {
  externalAgent: ExternalAgentApiSelect;
  headers?: Record<string, string> | null;
  relationId: string; // SubAgentExternalAgentRelation.id from the database
};

/**
 * Get transfer relations for a target sub-agent
 * Used when building agent configurations that need to know what the target can transfer to
 */
export function getTransferRelationsForTargetSubAgent(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  subAgentId: string;
}): TargetTransferRelation[] {
  const { agent, subAgentId } = params;
  const targetSubAgent = agent.subAgents?.[subAgentId];
  if (!targetSubAgent) return [];

  return (targetSubAgent.canTransferTo || [])
    .map((relation) => {
      const target = agent.subAgents?.[relation.subAgentId];
      return target
        ? {
            id: relation.subAgentId,
            name: target.name,
            description: target.description,
            relationId: relation.subAgentSubAgentRelationId,
          }
        : null;
    })
    .filter((r): r is TargetTransferRelation => r !== null);
}

/**
 * Get delegate relations (external agents) for a target sub-agent
 * Used when building agent configurations that need to know what external agents the target can delegate to
 */
export function getExternalAgentRelationsForTargetSubAgent(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
  subAgentId: string;
}): TargetExternalAgentRelation[] {
  const { agent, project, subAgentId } = params;
  const targetSubAgent = agent.subAgents?.[subAgentId];
  if (!targetSubAgent) return [];

  const delegateItems = targetSubAgent.canDelegateTo || [];

  return delegateItems
    .filter(
      (item): item is CanDelegateToExternalAgent =>
        typeof item === 'object' && item !== null && 'externalAgentId' in item
    )
    .map((item) => {
      const extAgent =
        agent.externalAgents?.[item.externalAgentId] ||
        project.externalAgents?.[item.externalAgentId];
      return extAgent
        ? {
            externalAgent: { ...extAgent, id: item.externalAgentId },
            headers: item.headers,
            relationId: item.subAgentExternalAgentRelationId,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

// Types for description enhancement
export type RelationForDescription = {
  id: string;
  name: string;
  description: string | null;
  relationType?: 'transfer' | 'delegate';
  relationId: string;
};

export type ExternalRelationForDescription = {
  externalAgent: { id: string; name: string; description: string | null };
  relationId: string;
};

export type TeamRelationForDescription = {
  targetAgent: { id: string; name: string; description: string | null };
  targetAgentId: string;
  relationId: string;
};

export type RelationsForDescriptionGeneration = {
  internalRelations: RelationForDescription[];
  externalRelations: ExternalRelationForDescription[];
  teamRelations: TeamRelationForDescription[];
};

/**
 * Build relation arrays from a sub-agent's canTransferTo and canDelegateTo
 * Used for generating enhanced descriptions
 */
export function buildRelationsForDescription(params: {
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
  subAgent: FullAgentSubAgentSelectWithRelationIds;
}): RelationsForDescriptionGeneration {
  const { agent, project, subAgent } = params;

  const canTransferTo = subAgent.canTransferTo || [];
  const canDelegateTo = subAgent.canDelegateTo || [];

  // Build internal (transfer) relations
  const internalRelations: RelationForDescription[] = canTransferTo
    .map((relation) => {
      const target = agent.subAgents?.[relation.subAgentId];
      return target
        ? {
            id: relation.subAgentId,
            name: target.name,
            description: target.description,
            relationType: 'transfer' as const,
            relationId: relation.subAgentSubAgentRelationId,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Build external and team relations from canDelegateTo
  const externalRelations: ExternalRelationForDescription[] = [];
  const teamRelations: TeamRelationForDescription[] = [];

  for (const item of canDelegateTo) {
    if ('externalAgentId' in item) {
      const extId = item.externalAgentId;
      const extAgent = agent.externalAgents?.[extId] || project.externalAgents?.[extId];
      if (extAgent) {
        externalRelations.push({
          externalAgent: { id: extId, name: extAgent.name, description: extAgent.description },
          relationId: item.subAgentExternalAgentRelationId,
        });
      }
    } else if ('agentId' in item) {
      const tId = item.agentId;
      const tAgent = agent.teamAgents?.[tId];
      if (tAgent) {
        teamRelations.push({
          targetAgent: { id: tId, name: tAgent.name, description: tAgent.description },
          targetAgentId: tId,
          relationId: item.subAgentTeamAgentRelationId,
        });
      }
    }
  }

  return { internalRelations, externalRelations, teamRelations };
}

/**
 * Enhance an internal relation with a generated description
 * Looks up the related sub-agent and builds relation data for description generation
 */
export function enhanceInternalRelation(params: {
  relation: InternalRelation;
  agent: AgentWithinContextOfProjectSelectWithRelationIds;
  project: FullProjectSelectWithRelationIds;
}): InternalRelation {
  const { relation, agent, project } = params;

  const relatedSubAgent = agent.subAgents?.[relation.id];
  if (!relatedSubAgent) {
    return relation;
  }

  const { internalRelations, externalRelations, teamRelations } = buildRelationsForDescription({
    agent,
    project,
    subAgent: relatedSubAgent,
  });

  const enhancedDescription = generateDescriptionWithRelationData(
    relation.description || '',
    internalRelations,
    externalRelations,
    teamRelations
  );

  return { ...relation, description: enhancedDescription };
}

/**
 * Enhance a team relation with a generated description
 * Looks up the team agent's default sub-agent and builds relation data for description generation
 */
export function enhanceTeamRelation(params: {
  relation: TeamRelation;
  project: FullProjectSelectWithRelationIds;
}): TeamRelation {
  const { relation, project } = params;

  const teamAgent = project.agents[relation.targetAgentId];
  if (!teamAgent?.defaultSubAgentId) {
    return relation;
  }

  const defaultSubAgent = teamAgent.subAgents?.[teamAgent.defaultSubAgentId];
  if (!defaultSubAgent) {
    return relation;
  }

  const { internalRelations, externalRelations, teamRelations } = buildRelationsForDescription({
    agent: teamAgent,
    project,
    subAgent: defaultSubAgent,
  });

  const enhancedDescription = generateDescriptionWithRelationData(
    teamAgent.description || '',
    internalRelations,
    externalRelations,
    teamRelations
  );

  return {
    ...relation,
    targetAgent: {
      ...relation.targetAgent,
      description: enhancedDescription,
    },
  };
}
