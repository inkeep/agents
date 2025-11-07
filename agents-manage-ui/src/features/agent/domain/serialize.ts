import type { Edge, Node } from '@xyflow/react';
import type {
  AgentToolConfigLookup,
  SubAgentExternalAgentConfigLookup,
  SubAgentTeamAgentConfigLookup,
} from '@/components/agent/agent';
import type { AgentMetadata } from '@/components/agent/configuration/agent-types';
import type { A2AEdgeData } from '@/components/agent/configuration/edge-types';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { FullAgentDefinition, InternalAgentDefinition } from '@/lib/types/agent-full';
import type { ExternalAgent } from '@/lib/types/external-agents';
import type { TeamAgent } from '@/lib/types/team-agents';
import { generateId } from '@/lib/utils/id-utils';

export type ExtendedAgent = InternalAgentDefinition & {
  dataComponents: string[];
  artifactComponents: string[];
  models?: AgentMetadata['models'];
  type: 'internal';
};

type ContextConfigParseError = Error & {
  field: 'contextVariables' | 'headersSchema';
};

const createContextConfigParseError = (
  field: ContextConfigParseError['field']
): ContextConfigParseError => {
  const message =
    field === 'contextVariables'
      ? 'Context variables must be valid JSON'
      : 'Headers schema must be valid JSON';
  const error = new Error(message) as ContextConfigParseError;
  error.name = 'ContextConfigParseError';
  error.field = field;
  return error;
};

export function isContextConfigParseError(error: unknown): error is ContextConfigParseError {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as Record<string, unknown>;
  return candidate.name === 'ContextConfigParseError' && typeof candidate.field === 'string';
}

// Note: Tools are now project-scoped, not part of FullAgentDefinition

/**
 * Safely parse a JSON string, returning undefined if parsing fails or input is falsy
 */
function safeJsonParse(jsonString: string | undefined | null): any {
  if (!jsonString) return undefined;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Error parsing JSON:', error);
    return undefined;
  }
}
function processModels(modelsData: AgentMetadata['models']): AgentMetadata['models'] | undefined {
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
export function serializeAgentData(
  nodes: Node[],
  edges: Edge[],
  metadata?: AgentMetadata,
  dataComponentLookup?: Record<string, DataComponent>,
  artifactComponentLookup?: Record<string, ArtifactComponent>,
  agentToolConfigLookup?: AgentToolConfigLookup,
  subAgentExternalAgentConfigLookup?: SubAgentExternalAgentConfigLookup,
  subAgentTeamAgentConfigLookup?: SubAgentTeamAgentConfigLookup
): FullAgentDefinition {
  const subAgents: Record<string, ExtendedAgent> = {};
  const externalAgents: Record<string, ExternalAgent> = {};
  const teamAgents: Record<string, TeamAgent> = {};
  const functionTools: Record<string, any> = {};
  const functions: Record<string, any> = {};
  // Note: Tools are now project-scoped and not included in agent serialization
  const usedDataComponents = new Set<string>();
  const usedArtifactComponents = new Set<string>();
  let defaultSubAgentId = '';

  for (const node of nodes) {
    if (node.type === NodeType.SubAgent) {
      const subAgentId = (node.data.id as string) ?? node.id;
      const subAgentDataComponents = (node.data.dataComponents as string[]) || [];
      const subAgentArtifactComponents = (node.data.artifactComponents as string[]) || [];

      subAgentDataComponents.forEach((componentId) => {
        usedDataComponents.add(componentId);
      });
      subAgentArtifactComponents.forEach((componentId) => {
        usedArtifactComponents.add(componentId);
      });
      // Process models - only include if it has non-empty, non-whitespace values
      const modelsData = node.data.models as AgentMetadata['models'] | undefined;
      const processedModels = processModels(modelsData);

      const stopWhen = (node.data as any).stopWhen;

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
            const tempSelectedTools = (mcpNode.data as any).tempSelectedTools;
            let toolSelection: string[] | null = null;

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

          const functionId = nodeData.functionId || functionToolId;

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

      if (node.data.isDefault) {
        defaultSubAgentId = subAgentId;
      }

      subAgents[subAgentId] = agent;
    } else if (node.type === NodeType.ExternalAgent) {
      const externalAgentId = (node.data.id as string) || node.id;

      const externalAgent: ExternalAgent & {
        tempHeaders: Record<string, string> | null;
        relationshipId: string | null;
      } = {
        id: externalAgentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        baseUrl: node.data.baseUrl as string,
        createdAt: node.data.createdAt as string,
        updatedAt: node.data.updatedAt as string,
        credentialReferenceId: (node.data.credentialReferenceId as string) || null,
        tempHeaders: (node.data as any).tempHeaders || null,
        relationshipId: (node.data.relationshipId as string) || null,
      };

      externalAgents[externalAgentId] = externalAgent;
    } else if (node.type === NodeType.TeamAgent) {
      const teamAgentId = (node.data.id as string) || node.id;
      const teamAgent: TeamAgent & {
        relationshipId: string | null;
        tempHeaders: Record<string, string> | null;
      } = {
        id: teamAgentId,
        name: node.data.name as string,
        description: (node.data.description as string) || '',
        tempHeaders: (node.data as any).tempHeaders || null,
        relationshipId: (node.data.relationshipId as string) || null,
      };
      teamAgents[teamAgentId] = teamAgent;
    }
    // External agent nodes are skipped - they are project-scoped resources
  }

  const subAgentExternalDelegateMap: Record<string, Record<string, any>> = {}; // subAgentId -> relationshipId ->  relationship data
  const newSubAgentExternalDelegateMap: Record<string, any> = {}; // subAgentId -> relationship data
  const subAgentTeamDelegateMap: Record<string, Record<string, any>> = {}; // subAgentId -> relationshipId ->  relationship data
  const newSubAgentTeamDelegateMap: Record<string, any> = {}; // subAgentId -> relationship data

  // Populate delegate maps from existing agent data to avoid linear searches
  Object.entries(subAgents).forEach(([subAgentId, agent]) => {
    if (agent.canDelegateTo) {
      agent.canDelegateTo.forEach((delegate) => {
        if (typeof delegate === 'object') {
          if ('externalAgentId' in delegate) {
            // External agent delegation
            if (!subAgentExternalDelegateMap[subAgentId]) {
              subAgentExternalDelegateMap[subAgentId] = {};
            }
            if (delegate.subAgentExternalAgentRelationId) {
              subAgentExternalDelegateMap[subAgentId][delegate.subAgentExternalAgentRelationId] =
                delegate;
            }
          } else if ('agentId' in delegate) {
            // Team agent delegation
            if (!subAgentTeamDelegateMap[subAgentId]) {
              subAgentTeamDelegateMap[subAgentId] = {};
            }
            if (delegate.subAgentTeamAgentRelationId) {
              subAgentTeamDelegateMap[subAgentId][delegate.subAgentTeamAgentRelationId] = delegate;
            }
          }
        }
      });
    }
  });

  for (const edge of edges) {
    if (
      edge.type === EdgeType.A2A ||
      edge.type === EdgeType.A2AExternal ||
      edge.type === EdgeType.A2ATeam ||
      edge.type === EdgeType.SelfLoop
    ) {
      const sourceAgentNode = nodes.find((node) => node.id === edge.source);
      const targetAgentNode = nodes.find((node) => node.id === edge.target);

      const sourceSubAgentId = (sourceAgentNode?.data.id || sourceAgentNode?.id) as string;
      const targetSubAgentId = (targetAgentNode?.data.id || targetAgentNode?.id) as string;
      const sourceAgent: ExtendedAgent = subAgents[sourceSubAgentId];

      const targetAgent: ExtendedAgent | undefined = subAgents[targetSubAgentId];
      const targetExternalAgent: ExternalAgent | undefined = externalAgents[targetSubAgentId];
      const targetTeamAgent: TeamAgent | undefined = teamAgents[targetSubAgentId];
      const isTargetExternal = targetExternalAgent !== undefined;
      const isTargetTeamAgent = targetTeamAgent !== undefined;

      if (!sourceAgent || !(edge.data as any)?.relationships) {
        continue;
      }

      const relationships = (edge.data as any).relationships as A2AEdgeData['relationships'];

      // Helper function to add relationship
      const addRelationship = (
        agent: ExtendedAgent,
        relationshipType: 'canTransferTo' | 'canDelegateTo',
        targetId: string,
        isExternal: boolean = false,
        isTeamAgent: boolean = false,
        headers?: Record<string, string>,
        relationshipId?: string
      ) => {
        if (relationshipType === 'canDelegateTo') {
          if (!agent.canDelegateTo) {
            agent.canDelegateTo = [];
          }

          // External agents always use object format
          if (isExternal) {
            const relationshipData: any = {
              externalAgentId: targetId,
              headers: headers ?? null,
            };

            // Only include relationshipId if it's not null (schema expects optional, not nullable)
            if (relationshipId) {
              relationshipData.subAgentExternalAgentRelationId = relationshipId;
            }

            // Store relationship in map - we'll rebuild canDelegateTo arrays at the end
            if (relationshipId) {
              if (!subAgentExternalDelegateMap[agent.id]) {
                subAgentExternalDelegateMap[agent.id] = {};
              }
              subAgentExternalDelegateMap[agent.id][relationshipId] = relationshipData;
            } else {
              if (!newSubAgentExternalDelegateMap[agent.id]) {
                newSubAgentExternalDelegateMap[agent.id] = {};
              }
              newSubAgentExternalDelegateMap[agent.id] = relationshipData;
            }
          } else if (isTeamAgent) {
            // Team agents use object format with agentId
            const relationshipData: any = {
              agentId: targetId,
              headers: headers ?? null,
            };

            // Only include relationshipId if it's not null (schema expects optional, not nullable)
            if (relationshipId) {
              relationshipData.subAgentTeamAgentRelationId = relationshipId;
            }

            // Store relationship in map - we'll rebuild canDelegateTo arrays at the end
            if (relationshipId) {
              if (!subAgentTeamDelegateMap[agent.id]) {
                subAgentTeamDelegateMap[agent.id] = {};
              }
              subAgentTeamDelegateMap[agent.id][relationshipId] = relationshipData;
            } else {
              if (!newSubAgentTeamDelegateMap[agent.id]) {
                newSubAgentTeamDelegateMap[agent.id] = {};
              }
              newSubAgentTeamDelegateMap[agent.id] = relationshipData;
            }
          } else {
            // Internal agents use string format
            if (!agent.canDelegateTo.includes(targetId)) {
              agent.canDelegateTo.push(targetId);
            }
          }
        } else {
          if (!agent.canTransferTo) agent.canTransferTo = [];
          if (!agent.canTransferTo.includes(targetId)) {
            agent.canTransferTo.push(targetId);
          }
        }
      };

      // Handle edges to external agents (only delegation is allowed)
      if (isTargetExternal) {
        if (relationships.delegateSourceToTarget) {
          const tempHeaders = (targetExternalAgent as any).tempHeaders;
          let externalAgentHeaders: Record<string, string> | undefined;
          const relationshipId = (targetExternalAgent as any).relationshipId;

          if (tempHeaders !== undefined) {
            if (
              typeof tempHeaders === 'object' &&
              tempHeaders !== null &&
              !Array.isArray(tempHeaders)
            ) {
              externalAgentHeaders = tempHeaders;
            }
          } else {
            const existingConfig = relationshipId
              ? subAgentExternalAgentConfigLookup?.[sourceSubAgentId]?.[relationshipId]
              : null;
            if (existingConfig?.headers) {
              externalAgentHeaders = existingConfig.headers;
            }
          }

          addRelationship(
            sourceAgent,
            'canDelegateTo',
            targetSubAgentId,
            true, // isExternal
            false, // isTeamAgent
            externalAgentHeaders,
            relationshipId
          );
        }
        continue;
      }

      // Handle edges to team agents (only delegation is allowed)
      if (isTargetTeamAgent) {
        if (relationships.delegateSourceToTarget) {
          const tempHeaders = (targetAgentNode as any).data?.tempHeaders;
          let teamAgentHeaders: Record<string, string> | undefined;
          const relationshipId = (targetAgentNode as any).data?.relationshipId;

          if (tempHeaders !== undefined) {
            if (
              typeof tempHeaders === 'object' &&
              tempHeaders !== null &&
              !Array.isArray(tempHeaders)
            ) {
              teamAgentHeaders = tempHeaders;
            }
          } else {
            const existingConfig = relationshipId
              ? subAgentTeamAgentConfigLookup?.[sourceSubAgentId]?.[relationshipId]
              : null;
            if (existingConfig?.headers) {
              teamAgentHeaders = existingConfig.headers;
            }
          }

          addRelationship(
            sourceAgent,
            'canDelegateTo',
            targetSubAgentId,
            false, // isExternal
            true, // isTeamAgent
            teamAgentHeaders,
            relationshipId
          );
        }
        continue;
      }

      // Handle edges between internal agents
      if (targetAgent) {
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
  const contextVariablesInput = metadata?.contextConfig?.contextVariables?.trim();
  const parsedContextVariables = safeJsonParse(contextVariablesInput);
  if (contextVariablesInput && !parsedContextVariables) {
    throw createContextConfigParseError('contextVariables');
  }

  const headersSchemaInput = metadata?.contextConfig?.headersSchema?.trim();
  const parsedHeadersSchema = safeJsonParse(headersSchemaInput);
  if (headersSchemaInput && !parsedHeadersSchema) {
    throw createContextConfigParseError('headersSchema');
  }

  const hasContextConfig =
    Boolean(
      parsedContextVariables &&
        typeof parsedContextVariables === 'object' &&
        Object.keys(parsedContextVariables).length
    ) ||
    Boolean(
      parsedHeadersSchema &&
        typeof parsedHeadersSchema === 'object' &&
        Object.keys(parsedHeadersSchema).length
    );

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

  const result: FullAgentDefinition = {
    id: metadata?.id || generateId(),
    name: metadata?.name ?? '',
    description: metadata?.description || undefined,
    defaultSubAgentId,
    subAgents: subAgents,
    ...(Object.keys(functionTools).length > 0 && { functionTools }),
    ...(Object.keys(functions).length > 0 && { functions }),
    // Note: Tools are now project-scoped and not included in FullAgentDefinition
    // ...(Object.keys(dataComponents).length > 0 && { dataComponents }),
    // ...(Object.keys(artifactComponents).length > 0 && { artifactComponents }),
  };

  // Add new agent-level fields
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

  if (metadata?.prompt) {
    (result as any).prompt = metadata.prompt;
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
    const contextConfigId = metadata.contextConfig.id || generateId();
    (result as any).contextConfigId = contextConfigId;
    (result as any).contextConfig = {
      id: contextConfigId,
      headersSchema: parsedHeadersSchema,
      contextVariables: parsedContextVariables,
    };
  }

  // Rebuild canDelegateTo arrays from delegate maps to ensure consistency
  Object.entries(subAgents).forEach(([subAgentId, agent]) => {
    if (agent.canDelegateTo) {
      // Start with internal agent delegations (string format)
      const internalDelegations = agent.canDelegateTo.filter(
        (delegate) => typeof delegate === 'string'
      );

      // Add external agent delegations from map
      const externalDelegations = Object.values(subAgentExternalDelegateMap[subAgentId] || {});

      // Add team agent delegations from map
      const teamDelegations = Object.values(subAgentTeamDelegateMap[subAgentId] || {});

      // Rebuild the array with all delegations
      agent.canDelegateTo = [...internalDelegations, ...externalDelegations, ...teamDelegations];

      if (newSubAgentExternalDelegateMap[subAgentId]) {
        agent.canDelegateTo.push(newSubAgentExternalDelegateMap[subAgentId]);
      }
      if (newSubAgentTeamDelegateMap[subAgentId]) {
        agent.canDelegateTo.push(newSubAgentTeamDelegateMap[subAgentId]);
      }
    }
  });

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
  data: FullAgentDefinition,
  functionToolNodeMap?: Map<string, string>
): StructuredValidationError[] {
  const errors: StructuredValidationError[] = [];

  if (!data.defaultSubAgentId) {
    errors.push({
      message: 'Default sub agent ID is required, please select a default sub agent.',
      field: 'defaultSubAgentId',
      code: 'required',
      path: ['defaultSubAgentId'],
    });
  }

  if (data.defaultSubAgentId && !data.subAgents[data.defaultSubAgentId]) {
    errors.push({
      message: `Default sub agent ID '${data.defaultSubAgentId}' not found in sub agents.`,
      field: 'defaultSubAgentId',
      code: 'invalid_reference',
      path: ['defaultSubAgentId'],
    });
  }

  for (const [subAgentId, agent] of Object.entries(data.subAgents)) {
    // All subAgents are internal agents (external agents are project-scoped)
    if (agent.canUse) {
      // Skip tool validation if tools data is not available (project-scoped)
      const toolsData = (data as any).tools;
      if (toolsData) {
        for (const canUseItem of agent.canUse) {
          const toolId = canUseItem.toolId;
          if (!toolsData[toolId]) {
            errors.push({
              message: `Tool '${toolId}' not found.`,
              field: 'toolId',
              code: 'invalid_reference',
              path: ['agents', subAgentId, 'canUse'],
            });
          }
        }
      }
    }

    if (agent.canUse) {
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

    // Validate relationships (all subAgents are internal agents)
    for (const targetId of agent.canTransferTo ?? []) {
      if (!data.subAgents[targetId]) {
        errors.push({
          message: `Transfer target '${targetId}' not found in agents.`,
          field: 'canTransferTo',
          code: 'invalid_reference',
          path: ['agents', subAgentId, 'canTransferTo'],
        });
      }
    }
    for (const targetId of agent.canDelegateTo ?? []) {
      // String = internal subAgent
      if (typeof targetId === 'string') {
        if (!data.subAgents[targetId]) {
          errors.push({
            message: `Delegate target '${targetId}' not found in agents.`,
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
