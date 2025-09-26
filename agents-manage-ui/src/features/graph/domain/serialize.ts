import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { A2AEdgeData } from '@/components/graph/configuration/edge-types';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import type { GraphMetadata } from '@/components/graph/configuration/graph-types';
import { NodeType } from '@/components/graph/configuration/node-types';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { FullGraphDefinition } from '@/lib/types/graph-full';

// Extract the internal agent type from the union
type InternalAgent = Extract<
  FullGraphDefinition['agents'][string],
  { canUse: Array<{ toolId: string; toolSelection?: string[] | null }> }
>;

type ExternalAgent = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  type: 'external';
};

export type ExtendedAgent =
  | (InternalAgent & {
      dataComponents: string[];
      artifactComponents: string[];
      models?: GraphMetadata['models'];
      type: 'internal';
    })
  | ExternalAgent;

// Note: Tools are now project-scoped, not part of FullGraphDefinition

/**
 * Safely parse a JSON string, returning undefined if parsing fails or input is falsy
 */
function safeJsonParse(jsonString: string | undefined | null): any {
  if (!jsonString) return undefined;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return undefined;
  }
}
function processModels(modelsData: GraphMetadata['models']): GraphMetadata['models'] | undefined {
  if (modelsData && typeof modelsData === 'object') {
    const hasNonEmptyValue = Object.values(modelsData).some(
      (value) => value !== null && value !== undefined && String(value).trim() !== ''
    );

    if (hasNonEmptyValue) {
      return {
        base: modelsData.base
          ? {
              model: modelsData.base.model,
              providerOptions: safeJsonParse(modelsData.base.providerOptions),
            }
          : undefined,
        structuredOutput: modelsData.structuredOutput
          ? {
              model: modelsData.structuredOutput.model,
              providerOptions: safeJsonParse(modelsData.structuredOutput.providerOptions),
            }
          : undefined,
        summarizer: modelsData.summarizer
          ? {
              model: modelsData.summarizer.model,
              providerOptions: safeJsonParse(modelsData.summarizer.providerOptions),
            }
          : undefined,
      };
    }
  }
  return undefined;
}
/**
 * Transforms React Flow nodes and edges back into the API data structure
 */
export function serializeGraphData(
  nodes: Node[],
  edges: Edge[],
  metadata?: GraphMetadata,
  dataComponentLookup?: Record<string, DataComponent>,
  artifactComponentLookup?: Record<string, ArtifactComponent>,
  selectedToolsLookup?: Record<string, Record<string, string[]>>
): FullGraphDefinition {
  const agents: Record<string, ExtendedAgent> = {};
  // Note: Tools are now project-scoped and not included in graph serialization
  const usedDataComponents = new Set<string>();
  const usedArtifactComponents = new Set<string>();
  let defaultAgentId = '';

  for (const node of nodes) {
    if (node.type === NodeType.Agent) {
      const agentId = (node.data.id as string) || node.id;
      const agentDataComponents = (node.data.dataComponents as string[]) || [];
      const agentArtifactComponents = (node.data.artifactComponents as string[]) || [];

      agentDataComponents.forEach((componentId) => {
        usedDataComponents.add(componentId);
      });
      agentArtifactComponents.forEach((componentId) => {
        usedArtifactComponents.add(componentId);
      });
      // Process models - only include if it has non-empty, non-whitespace values
      const modelsData = node.data.models as GraphMetadata['models'] | undefined;
      const processedModels = processModels(modelsData);

      const stopWhen = (node.data as any).stopWhen;

      // Build canUse array from edges connecting this agent to MCP nodes
      const canUse: Array<{ toolId: string; toolSelection?: string[] | null }> = [];

      console.log('edges serializeGraphData', edges);

      // Find edges from this agent to MCP nodes
      const agentToMcpEdges = edges.filter(
        (edge) =>
          edge.source === node.id &&
          nodes.some((n) => n.id === edge.target && n.type === NodeType.MCP)
      );

      for (const edge of agentToMcpEdges) {
        const mcpNode = nodes.find((n) => n.id === edge.target);

        if (mcpNode && mcpNode.type === NodeType.MCP) {
          const toolId = (mcpNode.data as any).toolId;

          if (toolId) {
            // Get selected tools from MCP node's tempSelectedTools
            const tempSelectedTools = (mcpNode.data as any).tempSelectedTools;
            let toolSelection: string[] | null = null;

            if (tempSelectedTools !== undefined) {
              // User has made changes to tool selection in the UI
              if (Array.isArray(tempSelectedTools)) {
                toolSelection = tempSelectedTools;
              } else if (tempSelectedTools === null) {
                toolSelection = null; // All tools selected
              }
            } else {
              // No changes made to tool selection - preserve existing selection
              if (
                selectedToolsLookup &&
                selectedToolsLookup[agentId] &&
                selectedToolsLookup[agentId][toolId] !== undefined
              ) {
                // Get existing selection from saved data
                toolSelection = selectedToolsLookup[agentId][toolId];
              } else {
                // Default to all tools selected when no existing data found
                toolSelection = null;
              }
            }

            canUse.push({
              toolId,
              toolSelection,
            });
          }
        }
      }

      const agent: ExtendedAgent = {
        id: agentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        prompt: node.data.prompt as string,
        canUse,
        canTransferTo: [],
        canDelegateTo: [],
        dataComponents: agentDataComponents,
        artifactComponents: agentArtifactComponents,
        ...(processedModels && { models: processedModels }),
        type: 'internal',
        ...(stopWhen && { stopWhen }),
      };

      if ((node.data as any).isDefault) {
        defaultAgentId = agentId;
      }

      agents[agentId] = agent;
    } else if (node.type === NodeType.ExternalAgent) {
      const agentId = (node.data.id as string) || node.id;
      const agent: ExternalAgent = {
        id: agentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        baseUrl: node.data.baseUrl as string,
        type: 'external',
      };

      if ((node.data as any).isDefault) {
        defaultAgentId = agentId;
      }

      agents[agentId] = agent;
    } else if (node.type === NodeType.MCP) {
      // Note: Tools are now project-scoped and not processed during graph serialization
      // Tool nodes in the UI are handled separately at the project level
      console.log('Skipping MCP tool node during graph serialization (tools are project-scoped)');
    }
  }

  for (const edge of edges) {
    if (
      edge.type === EdgeType.A2A ||
      edge.type === EdgeType.A2AExternal ||
      edge.type === EdgeType.SelfLoop
    ) {
      // edge.source and edge.target are the ids of the nodes (since we allow editing the agent ids we need to use node ids since those are stable)
      // we need to find the agents based on the node ids and then update the agents canTransferTo and canDelegateTo with the agent ids not the node ids

      const sourceAgentNode = nodes.find((node) => node.id === edge.source);
      const targetAgentNode = nodes.find((node) => node.id === edge.target);

      const sourceAgentId = (sourceAgentNode?.data.id || sourceAgentNode?.id) as string;
      const targetAgentId = (targetAgentNode?.data.id || targetAgentNode?.id) as string;
      const sourceAgent: ExtendedAgent = agents[sourceAgentId];
      const targetAgent: ExtendedAgent = agents[targetAgentId];

      if (sourceAgent && targetAgent && (edge.data as any)?.relationships) {
        const relationships = (edge.data as any).relationships as A2AEdgeData['relationships'];

        // Helper function to safely add relationship to internal agent
        const addRelationship = (
          agent: ExtendedAgent,
          relationshipType: 'canTransferTo' | 'canDelegateTo',
          targetId: string
        ) => {
          if ('canUse' in agent) {
            if (!agent[relationshipType]) agent[relationshipType] = [];
            const agentRelationships = agent[relationshipType];
            if (agentRelationships && !agentRelationships.includes(targetId)) {
              agentRelationships.push(targetId);
            }
          }
        };

        // Process transfer relationships
        if (relationships.transferSourceToTarget) {
          addRelationship(sourceAgent, 'canTransferTo', targetAgentId);
        }
        if (relationships.transferTargetToSource) {
          addRelationship(targetAgent, 'canTransferTo', sourceAgentId);
        }

        // Process delegation relationships
        if (relationships.delegateSourceToTarget) {
          addRelationship(sourceAgent, 'canDelegateTo', targetAgentId);
        }
        if (relationships.delegateTargetToSource) {
          addRelationship(targetAgent, 'canDelegateTo', sourceAgentId);
        }
      }
    }
  }

  const parsedContextVariables = safeJsonParse(metadata?.contextConfig?.contextVariables);

  const parsedRequestContextSchema = safeJsonParse(metadata?.contextConfig?.requestContextSchema);

  const hasContextConfig =
    metadata?.contextConfig &&
    ((metadata.contextConfig.name && metadata.contextConfig.name.trim() !== '') ||
      (metadata.contextConfig.description && metadata.contextConfig.description.trim() !== '') ||
      (parsedContextVariables &&
        typeof parsedContextVariables === 'object' &&
        parsedContextVariables !== null &&
        Object.keys(parsedContextVariables).length > 0) ||
      (parsedRequestContextSchema &&
        typeof parsedRequestContextSchema === 'object' &&
        parsedRequestContextSchema !== null &&
        Object.keys(parsedRequestContextSchema).length > 0));

  const dataComponents: Record<string, DataComponent> = {};
  if (dataComponentLookup) {
    usedDataComponents.forEach((componentId) => {
      const component = dataComponentLookup[componentId];
      if (component) {
        dataComponents[componentId] = component;
      }
    });
  }

  const artifactComponents: Record<string, ArtifactComponent> = {};
  if (artifactComponentLookup) {
    usedArtifactComponents.forEach((componentId) => {
      const component = artifactComponentLookup[componentId];
      if (component) {
        artifactComponents[componentId] = component;
      }
    });
  }

  const result: FullGraphDefinition = {
    id: metadata?.id || nanoid(),
    name: metadata?.name || 'Untitled Graph',
    description: metadata?.description || undefined,
    defaultAgentId,
    agents,
    // Note: Tools are now project-scoped and not included in FullGraphDefinition
    // ...(Object.keys(dataComponents).length > 0 && { dataComponents }),
    // ...(Object.keys(artifactComponents).length > 0 && { artifactComponents }),
  };

  // Add new graph-level fields
  if (metadata?.models) {
    (result as any).models = {
      base: metadata.models.base
        ? {
            model: metadata.models.base.model,
            providerOptions: safeJsonParse(metadata.models.base.providerOptions),
          }
        : undefined,
      structuredOutput: metadata.models.structuredOutput
        ? {
            model: metadata.models.structuredOutput.model,
            providerOptions: safeJsonParse(metadata.models.structuredOutput.providerOptions),
          }
        : undefined,
      summarizer: metadata.models.summarizer
        ? {
            model: metadata.models.summarizer.model,
            providerOptions: safeJsonParse(metadata.models.summarizer.providerOptions),
          }
        : undefined,
    };
  }

  if (metadata?.stopWhen) {
    (result as any).stopWhen = metadata.stopWhen;
  }

  if (metadata?.graphPrompt) {
    (result as any).graphPrompt = metadata.graphPrompt;
  }

  if (metadata?.statusUpdates) {
    const parsedStatusComponents = safeJsonParse(metadata.statusUpdates.statusComponents);
    (result as any).statusUpdates = {
      ...metadata.statusUpdates,
      statusComponents: parsedStatusComponents,
    };
  }

  // Add contextConfig if there's meaningful data
  if (hasContextConfig && metadata?.contextConfig) {
    const contextConfigId = metadata.contextConfig.id || nanoid();
    (result as any).contextConfigId = contextConfigId;
    (result as any).contextConfig = {
      id: contextConfigId,
      name: metadata.contextConfig.name || '',
      description: metadata.contextConfig.description || '',
      requestContextSchema: parsedRequestContextSchema,
      contextVariables: parsedContextVariables,
    };
  }

  return result;
}

export function validateSerializedData(data: FullGraphDefinition): string[] {
  const errors: string[] = [];

  if (data.defaultAgentId && !data.agents[data.defaultAgentId]) {
    errors.push(`Default agent ID '${data.defaultAgentId}' not found in agents`);
  }

  for (const [agentId, agent] of Object.entries(data.agents)) {
    // Only validate tools for internal agents (external agents don't have tools)
    if ('canUse' in agent && agent.canUse) {
      // Skip tool validation if tools data is not available (project-scoped)
      const toolsData = (data as any).tools;
      if (toolsData) {
        for (const canUseItem of agent.canUse) {
          const toolId = canUseItem.toolId;
          if (!toolsData[toolId]) {
            errors.push(`Tool '${toolId}' referenced by agent '${agentId}' not found in tools`);
          }
        }
      }
    }

    // Only validate relationships for internal agents (external agents don't have these properties)
    if ('canTransferTo' in agent) {
      for (const targetId of agent.canTransferTo ?? []) {
        if (!data.agents[targetId]) {
          errors.push(`Transfer target '${targetId}' for agent '${agentId}' not found in agents`);
        }
      }
    }
    if ('canDelegateTo' in agent) {
      for (const targetId of agent.canDelegateTo ?? []) {
        if (!data.agents[targetId]) {
          errors.push(`Delegate target '${targetId}' for agent '${agentId}' not found in agents`);
        }
      }
    }
  }

  return errors;
}
