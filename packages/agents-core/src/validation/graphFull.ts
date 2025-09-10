import type { z } from 'zod';
import type {
  AgentDefinition,
  ExternalAgentApiInsert,
  FullGraphDefinition,
  InternalAgentDefinition,
} from '../types/entities.js';
import { FullGraphDefinitionSchema } from '../validation/schemas.js';

// Type guard functions
export function isInternalAgent(agent: AgentDefinition): agent is InternalAgentDefinition {
  return 'prompt' in agent;
}

export function isExternalAgent(agent: AgentDefinition): agent is ExternalAgentApiInsert {
  return 'baseUrl' in agent;
}

// Zod-based validation and typing using the existing schema
export function validateAndTypeGraphData(data: unknown): z.infer<typeof FullGraphDefinitionSchema> {
  return FullGraphDefinitionSchema.parse(data);
}

/**
 * Validates that all tool IDs referenced in agents exist in the tools record
 */
export function validateToolReferences(graphData: FullGraphDefinition): void {
  const errors: string[] = [];
  const availableToolIds = new Set(Object.keys(graphData.tools));

  for (const [agentId, agentData] of Object.entries(graphData.agents)) {
    // Only internal agents have tools
    if (isInternalAgent(agentData) && agentData.tools && Array.isArray(agentData.tools)) {
      for (const toolId of agentData.tools) {
        if (!availableToolIds.has(toolId)) {
          errors.push(`Agent '${agentId}' references non-existent tool '${toolId}'`);
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
 */
export function validateDataComponentReferences(graphData: FullGraphDefinition): void {
  const errors: string[] = [];
  const availableDataComponentIds = new Set(Object.keys(graphData.dataComponents || {}));

  for (const [agentId, agentData] of Object.entries(graphData.agents)) {
    // Only internal agents have dataComponents
    if (isInternalAgent(agentData) && agentData.dataComponents) {
      for (const dataComponentId of agentData.dataComponents) {
        if (!availableDataComponentIds.has(dataComponentId)) {
          errors.push(
            `Agent '${agentId}' references non-existent dataComponent '${dataComponentId}'`
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
 * Ensures referential integrity between agents and their associated artifact components.
 *
 * @param graphData - The validated graph data containing agents and artifact components
 * @throws {Error} When agents reference non-existent artifact components
 * @example
 * ```typescript
 * const graphData = validateAndTypeGraphData(rawGraphData);
 * validateArtifactComponentReferences(graphData); // Throws if invalid references found
 * ```
 */
export function validateArtifactComponentReferences(graphData: FullGraphDefinition): void {
  const errors: string[] = [];
  const availableArtifactComponentIds = new Set(Object.keys(graphData.artifactComponents || {}));

  for (const [agentId, agentData] of Object.entries(graphData.agents)) {
    // Only internal agents have artifactComponents
    if (isInternalAgent(agentData) && agentData.artifactComponents) {
      for (const artifactComponentId of agentData.artifactComponents) {
        if (!availableArtifactComponentIds.has(artifactComponentId)) {
          errors.push(
            `Agent '${agentId}' references non-existent artifactComponent '${artifactComponentId}'`
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
  const availableAgentIds = new Set(Object.keys(graphData.agents));

  for (const [agentId, agentData] of Object.entries(graphData.agents)) {
    // Only internal agents have relationship properties
    if (isInternalAgent(agentData)) {
      // Validate transfer targets
      if (agentData.canTransferTo && Array.isArray(agentData.canTransferTo)) {
        for (const targetId of agentData.canTransferTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${agentId}' has transfer target '${targetId}' that doesn't exist in graph`
            );
          }
        }
      }

      // Validate delegation targets
      if (agentData.canDelegateTo && Array.isArray(agentData.canDelegateTo)) {
        for (const targetId of agentData.canDelegateTo) {
          if (!availableAgentIds.has(targetId)) {
            errors.push(
              `Agent '${agentId}' has delegation target '${targetId}' that doesn't exist in graph`
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
 */
export function validateGraphStructure(graphData: FullGraphDefinition): void {
  // Validate default agent exists
  if (!graphData.agents[graphData.defaultAgentId]) {
    throw new Error(`Default agent '${graphData.defaultAgentId}' does not exist in agents`);
  }

  // Validate tool references
  validateToolReferences(graphData);

  validateDataComponentReferences(graphData);

  validateArtifactComponentReferences(graphData);

  // Validate agent relationships
  validateAgentRelationships(graphData);
}
