import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { A2AEdgeData } from '@/components/graph/configuration/edge-types';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import type { GraphMetadata } from '@/components/graph/configuration/graph-types';
import { NodeType } from '@/components/graph/configuration/node-types';
import type { AgentToolConfigLookup } from '@/components/graph/graph';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { FullGraphDefinition, InternalAgentDefinition } from '@/lib/types/graph-full';

// Use the exported InternalAgentDefinition from core
type InternalAgent = InternalAgentDefinition;

type ExternalAgent = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  headers?: Record<string, string> | null;
  type: 'external';
  credentialReferenceId?: string | null;
};

export type ExtendedAgent =
  | (InternalAgent & {
      dataComponents: string[];
      artifactComponents: string[];
      models?: GraphMetadata['models'];
      type: 'internal';
    })
  | ExternalAgent;

// Type guard to check if an agent is an internal agent
function isInternalAgent(
  agent: ExtendedAgent | FullGraphDefinition['subAgents'][string]
): agent is InternalAgent {
  return agent.type === 'internal' && 'canUse' in agent;
}

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
  agentToolConfigLookup?: AgentToolConfigLookup
): FullGraphDefinition {
  const subAgents: Record<string, ExtendedAgent> = {};
  const functionTools: Record<string, any> = {};
  const functions: Record<string, any> = {};
  // Note: Tools are now project-scoped and not included in graph serialization
  const usedDataComponents = new Set<string>();
  const usedArtifactComponents = new Set<string>();
  let defaultSubAgentId = '';

  for (const node of nodes) {
    if (node.type === NodeType.Agent) {
      const subAgentId = (node.data.id as string) || node.id;
      const subAgentDataComponents = (node.data.dataComponents as string[]) || [];
      const subAgentArtifactComponents = (node.data.artifactComponents as string[]) || [];

      subAgentDataComponents.forEach((componentId) => {
        usedDataComponents.add(componentId);
      });
      subAgentArtifactComponents.forEach((componentId) => {
        usedArtifactComponents.add(componentId);
      });
      // Process models - only include if it has non-empty, non-whitespace values
      const modelsData = node.data.models as GraphMetadata['models'] | undefined;
      const processedModels = processModels(modelsData);

      const stopWhen = (node.data as any).stopWhen;

      // Build canUse array from edges connecting this agent to tool nodes (MCP and Function)
      const canUse: Array<{
        toolId: string;
        toolSelection?: string[] | null;
        headers?: Record<string, string> | null;
        agentToolRelationId?: string;
      }> = [];

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

            // Get the relationshipId from the MCP node first
            const relationshipId = (mcpNode.data as any).relationshipId;

            if (tempSelectedTools !== undefined) {
              // User has made changes to tool selection in the UI
              if (Array.isArray(tempSelectedTools)) {
                toolSelection = tempSelectedTools;
              } else if (tempSelectedTools === null) {
                toolSelection = null; // All tools selected
              }
            } else {
              // No changes made to tool selection - preserve existing selection
              const existingConfig = relationshipId
                ? agentToolConfigLookup?.[subAgentId]?.[relationshipId]
                : null;
              if (existingConfig?.toolSelection) {
                toolSelection = existingConfig.toolSelection;
              } else {
                // Default to all tools selected when no existing data found
                toolSelection = null;
              }
            }

            const tempHeaders = (mcpNode.data as any).tempHeaders;
            let toolHeaders: Record<string, string> | null = null;

            if (tempHeaders !== undefined) {
              if (
                typeof tempHeaders === 'object' &&
                tempHeaders !== null &&
                !Array.isArray(tempHeaders)
              ) {
                toolHeaders = tempHeaders;
              }
            } else {
              // No changes made to headers - preserve existing headers
              const existingConfig = relationshipId
                ? agentToolConfigLookup?.[subAgentId]?.[relationshipId]
                : null;
              if (existingConfig?.headers) {
                toolHeaders = existingConfig.headers;
              }
            }

            canUse.push({
              toolId,
              toolSelection,
              headers: toolHeaders,
              ...(relationshipId && { agentToolRelationId: relationshipId }),
            });
          }
        }
      }

      // Find edges from this agent to Function Tool nodes
      const agentToFunctionToolEdges = edges.filter(
        (edge) =>
          edge.source === node.id &&
          nodes.some((n) => n.id === edge.target && n.type === NodeType.FunctionTool)
      );

      for (const edge of agentToFunctionToolEdges) {
        const functionToolNode = nodes.find((n) => n.id === edge.target);

        if (functionToolNode && functionToolNode.type === NodeType.FunctionTool) {
          const nodeData = functionToolNode.data as any;

          const functionToolId = nodeData.functionToolId || nodeData.toolId || functionToolNode.id;
          const relationshipId = nodeData.relationshipId;

          // Get the function ID from the node data (should reference existing function)
          const functionId = nodeData.functionId || functionToolId;

          // Create function tool entry
          const functionToolData = {
            id: functionToolId,
            name: nodeData.name || '',
            description: nodeData.description || '',
            functionId: functionId, // Reference to existing function
          };

          // Always create function entry to ensure it exists
          const functionData = {
            id: functionId,
            name: nodeData.name || '',
            description: nodeData.description || '',
            executeCode: nodeData.code || '',
            inputSchema: nodeData.inputSchema || {},
            dependencies: nodeData.dependencies || {},
          };
          functions[functionId] = functionData;

          functionTools[functionToolId] = functionToolData;

          canUse.push({
            toolId: functionToolId,
            toolSelection: null,
            headers: null,
            ...(relationshipId && { agentToolRelationId: relationshipId }),
          });
        }
      }

      const agent: ExtendedAgent = {
        id: subAgentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        prompt: node.data.prompt as string,
        canUse,
        canTransferTo: [],
        canDelegateTo: [],
        dataComponents: subAgentDataComponents,
        artifactComponents: subAgentArtifactComponents,
        ...(processedModels && { models: processedModels }),
        type: 'internal',
        ...(stopWhen && { stopWhen }),
      };

      if ((node.data as any).isDefault) {
        defaultSubAgentId = subAgentId;
      }

      subAgents[subAgentId] = agent;
    } else if (node.type === NodeType.ExternalAgent) {
      const subAgentId = (node.data.id as string) || node.id;

      // Parse headers from JSON string to object
      const parsedHeaders = safeJsonParse(node.data.headers as string);

      const agent: ExternalAgent = {
        id: subAgentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        baseUrl: node.data.baseUrl as string,
        headers: parsedHeaders || null,
        type: 'external',
        credentialReferenceId: (node.data.credentialReferenceId as string) || null,
      };

      if ((node.data as any).isDefault) {
        defaultSubAgentId = subAgentId;
      }

      subAgents[subAgentId] = agent;
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

      const sourceSubAgentId = (sourceAgentNode?.data.id || sourceAgentNode?.id) as string;
      const targetSubAgentId = (targetAgentNode?.data.id || targetAgentNode?.id) as string;
      const sourceAgent: ExtendedAgent = subAgents[sourceSubAgentId];
      const targetAgent: ExtendedAgent = subAgents[targetSubAgentId];

      if (sourceAgent && targetAgent && (edge.data as any)?.relationships) {
        const relationships = (edge.data as any).relationships as A2AEdgeData['relationships'];

        // Helper function to safely add relationship to internal agent
        const addRelationship = (
          agent: ExtendedAgent,
          relationshipType: 'canTransferTo' | 'canDelegateTo',
          targetId: string
        ) => {
          if (isInternalAgent(agent)) {
            if (!agent[relationshipType]) agent[relationshipType] = [];
            const subAgentRelationships = agent[relationshipType];
            if (subAgentRelationships && !subAgentRelationships.includes(targetId)) {
              subAgentRelationships.push(targetId);
            }
          }
        };

        // Process transfer relationships
        if (relationships.transferSourceToTarget) {
          addRelationship(sourceAgent, 'canTransferTo', targetSubAgentId);
        }
        if (relationships.transferTargetToSource) {
          addRelationship(targetAgent, 'canTransferTo', sourceSubAgentId);
        }

        // Process delegation relationships
        if (relationships.delegateSourceToTarget) {
          addRelationship(sourceAgent, 'canDelegateTo', targetSubAgentId);
        }
        if (relationships.delegateTargetToSource) {
          addRelationship(targetAgent, 'canDelegateTo', sourceSubAgentId);
        }
      }
    }
  }

  const parsedContextVariables = safeJsonParse(metadata?.contextConfig?.contextVariables);

  const parsedHeadersSchema = safeJsonParse(metadata?.contextConfig?.headersSchema);

  const hasContextConfig =
    metadata?.contextConfig &&
    ((parsedContextVariables &&
      typeof parsedContextVariables === 'object' &&
      parsedContextVariables !== null &&
      Object.keys(parsedContextVariables).length > 0) ||
      (parsedHeadersSchema &&
        typeof parsedHeadersSchema === 'object' &&
        parsedHeadersSchema !== null &&
        Object.keys(parsedHeadersSchema).length > 0));

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
    defaultSubAgentId,
    subAgents: subAgents,
    ...(Object.keys(functionTools).length > 0 && { functionTools }),
    ...(Object.keys(functions).length > 0 && { functions }),
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
      headersSchema: parsedHeadersSchema,
      contextVariables: parsedContextVariables,
    };
  }

  return result;
}

interface StructuredValidationError {
  message: string;
  field: string;
  code: string;
  path: string[];
  functionToolId?: string;
}

export function validateSerializedData(
  data: FullGraphDefinition,
  functionToolNodeMap?: Map<string, string>
): StructuredValidationError[] {
  const errors: StructuredValidationError[] = [];

  if (data.defaultSubAgentId && !data.subAgents[data.defaultSubAgentId]) {
    errors.push({
      message: `Default agent ID '${data.defaultSubAgentId}' not found in agents`,
      field: 'defaultSubAgentId',
      code: 'invalid_reference',
      path: ['defaultSubAgentId'],
    });
  }

  for (const [subAgentId, agent] of Object.entries(data.subAgents)) {
    // Only validate tools for internal agents (external agents don't have tools)
    if (isInternalAgent(agent) && agent.canUse) {
      // Skip tool validation if tools data is not available (project-scoped)
      const toolsData = (data as any).tools;
      if (toolsData) {
        for (const canUseItem of agent.canUse) {
          const toolId = canUseItem.toolId;
          if (!toolsData[toolId]) {
            errors.push({
              message: `Tool '${toolId}' not found`,
              field: 'toolId',
              code: 'invalid_reference',
              path: ['agents', subAgentId, 'canUse'],
            });
          }
        }
      }
    }

    // Validate function tools for internal agents (check canUse array for function tools)
    if (isInternalAgent(agent) && agent.canUse) {
      for (const canUseItem of agent.canUse) {
        const toolId = canUseItem.toolId;
        const toolType = (canUseItem as any).toolType;

        // Only validate function tools
        if (toolType === 'function') {
          const functionTool = (canUseItem as any).functionTool;

          if (!functionTool) {
            // Use the node map to get the React Flow node ID if available
            const nodeId = functionToolNodeMap?.get(toolId) || toolId;
            errors.push({
              message: `Function tool is missing function tool data`,
              field: 'functionTool',
              code: 'missing_data',
              path: ['functionTools', toolId],
              functionToolId: nodeId,
            });
            continue;
          }

          // Use the node map to get the React Flow node ID if available
          const nodeId = functionToolNodeMap?.get(toolId) || toolId;

          // Validate required fields for function tools
          if (!functionTool.name || String(functionTool.name).trim() === '') {
            errors.push({
              message: 'Function tool name is required',
              field: 'name',
              code: 'required',
              path: ['functionTools', toolId, 'name'],
              functionToolId: nodeId,
            });
          }
          if (!functionTool.description || String(functionTool.description).trim() === '') {
            errors.push({
              message: 'Function tool description is required',
              field: 'description',
              code: 'required',
              path: ['functionTools', toolId, 'description'],
              functionToolId: nodeId,
            });
          }
          if (!functionTool.executeCode || String(functionTool.executeCode).trim() === '') {
            errors.push({
              message: 'Function tool code is required',
              field: 'code',
              code: 'required',
              path: ['functionTools', toolId, 'executeCode'],
              functionToolId: nodeId,
            });
          }
          if (!functionTool.inputSchema || Object.keys(functionTool.inputSchema).length === 0) {
            errors.push({
              message: 'Function tool input schema is required',
              field: 'inputSchema',
              code: 'required',
              path: ['functionTools', toolId, 'inputSchema'],
              functionToolId: nodeId,
            });
          }
        }
      }
    }

    // Only validate relationships for internal agents (external agents don't have these properties)
    if (isInternalAgent(agent)) {
      for (const targetId of agent.canTransferTo ?? []) {
        if (!data.subAgents[targetId]) {
          errors.push({
            message: `Transfer target '${targetId}' not found in agents`,
            field: 'canTransferTo',
            code: 'invalid_reference',
            path: ['agents', subAgentId, 'canTransferTo'],
          });
        }
      }
      for (const targetId of agent.canDelegateTo ?? []) {
        if (!data.subAgents[targetId]) {
          errors.push({
            message: `Delegate target '${targetId}' not found in agents`,
            field: 'canDelegateTo',
            code: 'invalid_reference',
            path: ['agents', subAgentId, 'canDelegateTo'],
          });
        }
      }
    }
  }

  return errors;
}
