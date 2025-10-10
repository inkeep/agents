import type { z } from 'zod';
import type {
  AgentDefinition,
  ExternalAgentApiInsert,
  FullGraphDefinition,
  InternalAgentDefinition,
} from '../types/entities';
import { AgentWithinContextOfProjectSchema } from '../validation/schemas';

// Type guard functions
export function isInternalAgent(agent: AgentDefinition): agent is InternalAgentDefinition {
  return 'prompt' in agent;
}

export function isExternalAgent(agent: AgentDefinition): agent is ExternalAgentApiInsert {
  return 'baseUrl' in agent;
}

// Zod-based validation and typing using the existing schema
export function validateAndTypeGraphData(
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
  graphData: FullGraphDefinition,
  availableToolIds?: Set<string>
): void {
  // If no tool IDs provided, skip validation (will be done at project level)
  if (!availableToolIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, agentData] of Object.entries(graphData.subAgents)) {
    // Only internal agents have tools
    if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
      for (const canUseItem of agentData.canUse) {
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
  graphData: FullGraphDefinition,
  availableDataComponentIds?: Set<string>
): void {
  // If no dataComponent IDs provided, skip validation (will be done at project level)
  if (!availableDataComponentIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, agentData] of Object.entries(graphData.subAgents)) {
    // Only internal agents have dataComponents
    if (isInternalAgent(agentData) && agentData.dataComponents) {
      for (const dataComponentId of agentData.dataComponents) {
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
  graphData: FullGraphDefinition,
  availableArtifactComponentIds?: Set<string>
): void {
  // If no artifactComponent IDs provided, skip validation (will be done at project level)
  if (!availableArtifactComponentIds) {
    return;
  }

  const errors: string[] = [];

  for (const [subAgentId, agentData] of Object.entries(graphData.subAgents)) {
    // Only internal agents have artifactComponents
    if (isInternalAgent(agentData) && agentData.artifactComponents) {
      for (const artifactComponentId of agentData.artifactComponents) {
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
 * Validates agent relationships (transfer and delegation targets exist)
 */
export function validateAgentRelationships(graphData: FullGraphDefinition): void {
  const errors: string[] = [];
  const availableAgentIds = new Set(Object.keys(graphData.subAgents));

  for (const [subAgentId, agentData] of Object.entries(graphData.subAgents)) {
    // Only internal agents have relationship properties
    if (isInternalAgent(agentData)) {
      // Validate transfer targets
      if (agentData.canTransferTo && Array.isArray(agentData.canTransferTo)) {
        for (const targetId of agentData.canTransferTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${subAgentId}' has transfer target '${targetId}' that doesn't exist in graph`
            );
          }
        }
      }

      // Validate delegation targets
      if (agentData.canDelegateTo && Array.isArray(agentData.canDelegateTo)) {
        for (const targetId of agentData.canDelegateTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${subAgentId}' has delegation target '${targetId}' that doesn't exist in graph`
            );
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
 * Validates the graph structure before creation/update
 * Note: With scoped architecture, project-scoped resource validation should be done at project level
 */
export function validateGraphStructure(
  graphData: FullGraphDefinition,
  projectResources?: {
    toolIds?: Set<string>;
    dataComponentIds?: Set<string>;
    artifactComponentIds?: Set<string>;
  }
): void {
  // Validate default agent exists (if specified)
  if (graphData.defaultSubAgentId && !graphData.subAgents[graphData.defaultSubAgentId]) {
    throw new Error(`Default agent '${graphData.defaultSubAgentId}' does not exist in agents`);
  }

  // Validate resource references if project resources are provided
  if (projectResources) {
    validateToolReferences(graphData, projectResources.toolIds);
    validateDataComponentReferences(graphData, projectResources.dataComponentIds);
    validateArtifactComponentReferences(graphData, projectResources.artifactComponentIds);
  }

  // Validate agent relationships (this is always graph-scoped)
  validateAgentRelationships(graphData);
}
