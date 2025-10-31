import type { z } from 'zod';
import type { FullAgentDefinition } from '../types/entities';
import { detectDelegationCycles } from './cycleDetection';
import { AgentWithinContextOfProjectSchema } from './schemas';

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
    if (subAgent.canUse && Array.isArray(subAgent.canUse)) {
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
    if (subAgent.dataComponents) {
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
    if (subAgent.artifactComponents) {
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
 * Validates agent relationships (transfer and delegation targets exist, and there is no circular delegation)
 */
export function validateAgentRelationships(agentData: FullAgentDefinition): void {
  const errors: string[] = [];
  const availableAgentIds = new Set(Object.keys(agentData.subAgents));
  const availableExternalAgentIds = new Set(Object.keys(agentData.externalAgents ?? {}));

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    // Only internal agents have relationship properties
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
      for (const targetItem of subAgent.canDelegateTo) {
        console.log('targetItem', targetItem);
        // canDelegateTo can be a string (internal subAgent ID) or object (external agent reference)
        if (typeof targetItem === 'string') {
          console.log('targetItem is string', targetItem);
          // Validate internal subAgent delegation
          if (!availableAgentIds.has(targetItem) && !availableExternalAgentIds.has(targetItem)) {
            errors.push(
              `Agent '${subAgentId}' has delegation target '${targetItem}' that doesn't exist in agent`
            );
          }
        }
      }
    }
  }

  const cycles = detectDelegationCycles(agentData);
  if (cycles.length > 0) {
    errors.push(...cycles);
  }

  if (errors.length > 0)
    throw new Error(`Agent relationship validation failed:\n${errors.join('\n')}`);
}

export function validateSubAgentExternalAgentRelations(
  agentData: FullAgentDefinition,
  availableExternalAgentIds?: Set<string>
): void {
  if (!availableExternalAgentIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    if (subAgent.canDelegateTo && Array.isArray(subAgent.canDelegateTo)) {
      for (const targetItem of subAgent.canDelegateTo) {
        if (typeof targetItem === 'object' && 'externalAgentId' in targetItem) {
          if (!availableExternalAgentIds.has(targetItem.externalAgentId)) {
            errors.push(
              `Agent '${subAgentId}' has delegation target '${targetItem.externalAgentId}' that doesn't exist in agent`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0)
    throw new Error(`Sub agent external agent relation validation failed:\n${errors.join('\n')}`);
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
    externalAgentIds?: Set<string>;
  }
): void {
  if (agentData.defaultSubAgentId && !agentData.subAgents[agentData.defaultSubAgentId]) {
    throw new Error(`Default agent '${agentData.defaultSubAgentId}' does not exist in agents`);
  }

  if (projectResources) {
    validateToolReferences(agentData, projectResources.toolIds);
    validateDataComponentReferences(agentData, projectResources.dataComponentIds);
    validateArtifactComponentReferences(agentData, projectResources.artifactComponentIds);
    validateSubAgentExternalAgentRelations(agentData, projectResources.externalAgentIds);
  }

  validateAgentRelationships(agentData);
}
