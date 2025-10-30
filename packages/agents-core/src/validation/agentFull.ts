import type { z } from 'zod';
import type {
  SubAgentDefinition,
  ExternalSubAgentApiInsert,
  FullAgentDefinition,
  InternalSubAgentDefinition,
} from '../types/entities';
import { AgentWithinContextOfProjectSchema } from './schemas';

export function isInternalAgent(agent: SubAgentDefinition): agent is InternalSubAgentDefinition {
  return 'prompt' in agent;
}

export function isExternalAgent(agent: SubAgentDefinition): agent is ExternalSubAgentApiInsert {
  return 'baseUrl' in agent;
}

// Zod-based validation and typing using the existing schema
export function validateAndTypeAgentData(
  data: unknown
): z.infer<typeof AgentWithinContextOfProjectSchema> {
  return AgentWithinContextOfProjectSchema.parse(data);
}

/**
 * Validates that all tool IDs referenced in agents exist in the tools record
 * Note: With scoped architecture, tool validation should be done at the project level
 * This function is kept for backward compatibility but will need project-scoped tool data
 */
export function validateToolReferences(
  agentData: FullAgentDefinition,
  availableToolIds?: Set<string>
): void {
  if (!availableToolIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    // Only internal agents have tools
    if (isInternalAgent(subAgent) && subAgent.canUse && Array.isArray(subAgent.canUse)) {
      for (const canUseItem of subAgent.canUse) {
        if (!availableToolIds.has(canUseItem.toolId)) {
          errors.push(`Agent '${subAgentId}' references non-existent tool '${canUseItem.toolId}'`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Tool reference validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Validates that all dataComponent IDs referenced in agents exist in the dataComponents record
 * Note: With scoped architecture, dataComponent validation should be done at the project level
 */
export function validateDataComponentReferences(
  agentData: FullAgentDefinition,
  availableDataComponentIds?: Set<string>
): void {
  if (!availableDataComponentIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    // Only internal agents have dataComponents
    if (isInternalAgent(subAgent) && subAgent.dataComponents) {
      for (const dataComponentId of subAgent.dataComponents) {
        if (!availableDataComponentIds.has(dataComponentId)) {
          errors.push(
            `Agent '${subAgentId}' references non-existent dataComponent '${dataComponentId}'`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`DataComponent reference validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Validates that all artifactComponent IDs referenced in agents exist in the artifactComponents record.
 * Note: With scoped architecture, artifactComponent validation should be done at the project level
 */
export function validateArtifactComponentReferences(
  agentData: FullAgentDefinition,
  availableArtifactComponentIds?: Set<string>
): void {
  if (!availableArtifactComponentIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    // Only internal agents have artifactComponents
    if (isInternalAgent(subAgent) && subAgent.artifactComponents) {
      for (const artifactComponentId of subAgent.artifactComponents) {
        if (!availableArtifactComponentIds.has(artifactComponentId)) {
          errors.push(
            `Agent '${subAgentId}' references non-existent artifactComponent '${artifactComponentId}'`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`ArtifactComponent reference validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Validates agent relationships (transfer and delegation targets exist, no circular delegation)
 */
export function validateAgentRelationships(agentData: FullAgentDefinition): void {
  const errors: string[] = [];
  const availableAgentIds = new Set(Object.keys(agentData.subAgents));

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    // Only internal agents have relationship properties
    if (isInternalAgent(subAgent)) {
      if (subAgent.canTransferTo && Array.isArray(subAgent.canTransferTo)) {
        for (const targetId of subAgent.canTransferTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${subAgentId}' has transfer target '${targetId}' that doesn't exist in agent`
            );
          }
        }
      }

      if (subAgent.canDelegateTo && Array.isArray(subAgent.canDelegateTo)) {
        for (const targetId of subAgent.canDelegateTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${subAgentId}' has delegation target '${targetId}' that doesn't exist in agent`
            );
          }
        }
      }
    }
  }

  // Check for two way delegation 
  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    if (isInternalAgent(subAgent) && subAgent.canDelegateTo && Array.isArray(subAgent.canDelegateTo)) {
      for (const targetId of subAgent.canDelegateTo) {
        const targetAgent = agentData.subAgents[targetId];
        if (targetAgent && isInternalAgent(targetAgent)) {
          // Check if target delegates back to this agent
          if (targetAgent.canDelegateTo && Array.isArray(targetAgent.canDelegateTo)) {
            if (targetAgent.canDelegateTo.includes(subAgentId)) {
              errors.push(
                `Circular delegation detected: Agent '${subAgentId}' delegates to '${targetId}' which delegates back to '${subAgentId}'. Two-way delegation is not allowed.`
              );
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Agent relationship validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Validates the agent structure before creation/update
 * Note: With scoped architecture, project-scoped resource validation should be done at project level
 */
export function validateAgentStructure(
  agentData: FullAgentDefinition,
  projectResources?: {
    toolIds?: Set<string>;
    dataComponentIds?: Set<string>;
    artifactComponentIds?: Set<string>;
  }
): void {
  if (agentData.defaultSubAgentId && !agentData.subAgents[agentData.defaultSubAgentId]) {
    throw new Error(`Default agent '${agentData.defaultSubAgentId}' does not exist in agents`);
  }

  if (projectResources) {
    validateToolReferences(agentData, projectResources.toolIds);
    validateDataComponentReferences(agentData, projectResources.dataComponentIds);
    validateArtifactComponentReferences(agentData, projectResources.artifactComponentIds);
  }

  validateAgentRelationships(agentData);
}
