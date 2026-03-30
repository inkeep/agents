import type { Edge, Node } from '@xyflow/react';
import type { z } from 'zod';
import type { AgentModels } from '@/components/agent/configuration/agent-types';
import type { A2AEdgeData } from '@/components/agent/configuration/edge-types';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { isNodeType, NodeType } from '@/components/agent/configuration/node-types';
import type {
  AgentSkill,
  FunctionToolRelationSchema,
  MCPRelationSchema,
} from '@/components/agent/form/validation';
import type { FullAgentFormValues, FullAgentPayload } from '@/lib/types/agent-full';
import { getFunctionToolRelationFormKey, getMcpRelationFormKey } from './form-state-defaults';
import { getFunctionIdForTool } from './function-tool-identity';
import { getNodeGraphKey } from './graph-identity';
import { getSubAgentIdForNode } from './sub-agent-identity';

type ExtendedAgent = FullAgentPayload['subAgents'][string];

// Note: Tools are now project-scoped, not part of FullAgentDefinition

/**
 * Safely parse a JSON string, returning undefined if parsing fails or input is falsy
 */
function safeJsonParse(value: string | object | undefined | null): any {
  if (!value) return;

  // If it's already an object, return it as-is
  if (typeof value === 'object') return value;

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Error parsing JSON:', error);
      return;
    }
  }

  return;
}

function hasNonEmptyProviderOptions(value: string | object | undefined | null): boolean {
  const parsedValue = safeJsonParse(value);

  if (parsedValue == null) {
    return false;
  }

  if (typeof parsedValue === 'object') {
    return Object.keys(parsedValue).length > 0;
  }

  return String(parsedValue).trim() !== '';
}

function processModels(modelsData?: AgentModels): ExtendedAgent['models'] | undefined {
  if (!modelsData || typeof modelsData !== 'object') {
    return;
  }

  const hasNonEmptyValue = [
    modelsData.base,
    modelsData.structuredOutput,
    modelsData.summarizer,
  ].some(
    (section) =>
      Boolean(section?.model?.trim()) || hasNonEmptyProviderOptions(section?.providerOptions)
  );

  if (!hasNonEmptyValue) {
    return;
  }

  return {
    base: modelsData.base
      ? {
          model: modelsData.base.model,
          providerOptions: safeJsonParse(modelsData.base.providerOptions),
          ...(modelsData.base.fallbackModels?.length && {
            fallbackModels: modelsData.base.fallbackModels.filter(Boolean),
          }),
          ...(modelsData.base.allowedProviders?.length && {
            allowedProviders: modelsData.base.allowedProviders.filter(Boolean),
          }),
        }
      : undefined,
    structuredOutput: modelsData.structuredOutput
      ? {
          model: modelsData.structuredOutput.model,
          providerOptions: safeJsonParse(modelsData.structuredOutput.providerOptions),
          ...(modelsData.structuredOutput.fallbackModels?.length && {
            fallbackModels: modelsData.structuredOutput.fallbackModels.filter(Boolean),
          }),
          ...(modelsData.structuredOutput.allowedProviders?.length && {
            allowedProviders: modelsData.structuredOutput.allowedProviders.filter(Boolean),
          }),
        }
      : undefined,
    summarizer: modelsData.summarizer
      ? {
          model: modelsData.summarizer.model,
          providerOptions: safeJsonParse(modelsData.summarizer.providerOptions),
          ...(modelsData.summarizer.fallbackModels?.length && {
            fallbackModels: modelsData.summarizer.fallbackModels.filter(Boolean),
          }),
          ...(modelsData.summarizer.allowedProviders?.length && {
            allowedProviders: modelsData.summarizer.allowedProviders.filter(Boolean),
          }),
        }
      : undefined,
  };
}

type SerializeAgentDataType = Pick<
  FullAgentPayload,
  'defaultSubAgentId' | 'subAgents' | 'functions' | 'functionTools'
>;

type PartialMCPRelation = Pick<
  z.output<typeof MCPRelationSchema>,
  'relationshipId' | 'selectedTools' | 'headers' | 'toolPolicies'
>;
type MCPRelationFormData = Record<string, PartialMCPRelation>;
type PartialFunctionToolRelation = Pick<
  z.output<typeof FunctionToolRelationSchema>,
  'relationshipId'
>;
type FunctionToolRelationFormData = Record<string, PartialFunctionToolRelation>;
type SerializeSubAgentFormData = NonNullable<FullAgentFormValues['subAgents']>;
type SerializeFunctionToolFormData = NonNullable<FullAgentFormValues['functionTools']>;
type SerializeFunctionsFormData = NonNullable<FullAgentFormValues['functions']>;
type SerializeExternalAgentFormData = NonNullable<FullAgentFormValues['externalAgents']>;
type SerializeTeamAgentFormData = NonNullable<FullAgentFormValues['teamAgents']>;

export interface SerializeAgentFormState {
  mcpRelations: MCPRelationFormData;
  functionToolRelations: FunctionToolRelationFormData;
  functionTools: SerializeFunctionToolFormData;
  externalAgents: SerializeExternalAgentFormData;
  teamAgents: SerializeTeamAgentFormData;
  subAgents: SerializeSubAgentFormData;
  functions: SerializeFunctionsFormData;
  defaultSubAgentNodeId?: FullAgentFormValues['defaultSubAgentNodeId'];
}

function requireFormValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

/**
 * Transforms React Flow nodes and edges back into the API data structure
 */
export function editorToPayload(
  nodes: Node[],
  edges: Edge[],
  formState: SerializeAgentFormState
): SerializeAgentDataType {
  const {
    mcpRelations,
    functionToolRelations,
    functionTools: functionToolFormData,
    externalAgents,
    teamAgents,
    subAgents: subAgentFormData,
    functions: functionsFormData,
    defaultSubAgentNodeId,
  } = formState;
  const subAgents: SerializeAgentDataType['subAgents'] = {};
  const functionTools: NonNullable<SerializeAgentDataType['functionTools']> = {};
  const functions: NonNullable<SerializeAgentDataType['functions']> = {};

  for (const node of nodes) {
    if (node.type === NodeType.SubAgent) {
      const subAgentForm = requireFormValue(
        subAgentFormData[node.id],
        `Missing RHF sub agent data for node "${node.id}".`
      );
      const subAgentId = getSubAgentIdForNode(node, subAgentFormData) as string;
      const subAgentDataComponents = subAgentForm.dataComponents ?? [];
      const subAgentArtifactComponents = subAgentForm.artifactComponents ?? [];
      const modelsData = subAgentForm.models as AgentModels | undefined;
      // Process models - only include if it has non-empty, non-whitespace values
      const processedModels = processModels(modelsData);
      const stopWhen = subAgentForm.stopWhen;
      const nodeSkills: AgentSkill[] = subAgentForm.skills ?? [];

      const canUse: Array<{
        toolId: string;
        toolSelection?: string[] | null;
        headers?: PartialMCPRelation['headers'] | null;
        toolPolicies?: PartialMCPRelation['toolPolicies'] | null;
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

        if (isNodeType(mcpNode, NodeType.MCP)) {
          const toolId = mcpNode.data.toolId;

          if (toolId) {
            const relationKey = getMcpRelationFormKey({ nodeId: mcpNode.id });
            const relationFormData = requireFormValue(
              mcpRelations[relationKey],
              `Missing RHF MCP relation data for node "${mcpNode.id}".`
            );
            const relationshipId = relationFormData.relationshipId ?? null;
            const toolSelection = relationFormData.selectedTools ?? null;
            const toolHeaders = relationFormData.headers ?? null;
            const toolPolicies = relationFormData.toolPolicies ?? null;

            canUse.push({
              toolId,
              toolSelection,
              headers: toolHeaders,
              toolPolicies,
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

        if (isNodeType(functionToolNode, NodeType.FunctionTool)) {
          const functionToolId = requireFormValue(
            functionToolNode.data.toolId,
            `Missing function tool id for node "${functionToolNode.id}".`
          );
          const relationKey = requireFormValue(
            getNodeGraphKey(functionToolNode),
            `Missing graph key for function tool node "${functionToolNode.id}".`
          );
          const relationshipId =
            functionToolRelations[getFunctionToolRelationFormKey({ nodeKey: relationKey })]
              ?.relationshipId ?? null;
          const functionTool = requireFormValue(
            functionToolFormData[functionToolId],
            `Missing RHF function tool data for node "${functionToolNode.id}".`
          );
          const functionId = requireFormValue(
            getFunctionIdForTool(functionToolId, functionToolFormData),
            `Missing RHF function id for tool "${functionToolId}".`
          );
          const formFunction = requireFormValue(
            functionsFormData[functionId],
            `Missing RHF function data for function "${functionId}".`
          );

          functionTools[functionToolId] = {
            id: functionToolId,
            name: functionTool.name ?? '',
            description: functionTool.description ?? '',
            functionId, // Reference to existing function
          };

          // Always create function entry to ensure it exists
          functions[functionId] = {
            id: functionId,
            executeCode: formFunction.executeCode ?? '',
            inputSchema: formFunction.inputSchema ?? {},
            dependencies: formFunction.dependencies ?? {},
          };

          const toolPolicies = functionTool.tempToolPolicies;
          const hasToolPolicies = toolPolicies && Object.keys(toolPolicies).length > 0;

          canUse.push({
            toolId: functionToolId,
            toolSelection: null,
            headers: null,
            ...(hasToolPolicies && { toolPolicies }),
            ...(relationshipId && { agentToolRelationId: relationshipId }),
          });
        }
      }

      const agent: ExtendedAgent = {
        id: subAgentId,
        name: subAgentForm.name,
        description: subAgentForm.description ?? '',
        prompt: subAgentForm.prompt ?? '',
        canUse,
        canTransferTo: [],
        canDelegateTo: [],
        dataComponents: subAgentDataComponents,
        artifactComponents: subAgentArtifactComponents,
        ...(processedModels && { models: processedModels }),
        type: subAgentForm.type ?? 'internal',
        ...(nodeSkills?.length && {
          skills: nodeSkills.map((skill) => ({
            id: skill.id,
            index: skill.index,
            alwaysLoaded: skill.alwaysLoaded,
          })),
        }),
        ...(stopWhen && { stopWhen }),
      };

      subAgents[subAgentId] = agent;
    }
  }

  const subAgentExternalDelegateMap: Record<string, Record<string, any>> = {}; // subAgentId -> relationshipId ->  relationship data
  const newSubAgentExternalDelegateMap: Record<string, any> = {}; // subAgentId -> relationship data
  const subAgentTeamDelegateMap: Record<string, Record<string, any>> = {}; // subAgentId -> relationshipId ->  relationship data
  const newSubAgentTeamDelegateMap: Record<string, any> = {}; // subAgentId -> relationship data

  for (const edge of edges) {
    if (
      edge.type === EdgeType.A2A ||
      edge.type === EdgeType.A2AExternal ||
      edge.type === EdgeType.A2ATeam ||
      edge.type === EdgeType.SelfLoop
    ) {
      const sourceAgentNode = nodes.find((node) => node.id === edge.source);
      const targetAgentNode = nodes.find((node) => node.id === edge.target);

      const sourceSubAgentId = getSubAgentIdForNode(sourceAgentNode, subAgentFormData) as string;
      const targetSubAgentId = isNodeType(targetAgentNode, NodeType.ExternalAgent)
        ? targetAgentNode.data.externalAgentId
        : isNodeType(targetAgentNode, NodeType.TeamAgent)
          ? targetAgentNode.data.teamAgentId
          : (getSubAgentIdForNode(targetAgentNode, subAgentFormData) as string);
      const sourceAgent: ExtendedAgent = subAgents[sourceSubAgentId];

      const targetAgent: ExtendedAgent | undefined = subAgents[targetSubAgentId];
      const isTargetExternal = isNodeType(targetAgentNode, NodeType.ExternalAgent);
      const isTargetTeamAgent = isNodeType(targetAgentNode, NodeType.TeamAgent);

      if (!sourceAgent || !edge.data?.relationships) {
        continue;
      }

      const relationships = edge.data.relationships as A2AEdgeData['relationships'];

      // Helper function to add relationship
      const addRelationship = (
        agent: ExtendedAgent,
        relationshipType: 'canTransferTo' | 'canDelegateTo',
        targetId: string,
        isExternal = false,
        isTeamAgent = false,
        headers?: Record<string, string>,
        relationshipId?: string
      ) => {
        if (relationshipType === 'canDelegateTo') {
          agent.canDelegateTo ??= [];

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
              subAgentExternalDelegateMap[agent.id] ??= {};
              subAgentExternalDelegateMap[agent.id][relationshipId] = relationshipData;
            } else {
              newSubAgentExternalDelegateMap[agent.id] ??= {};
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
              subAgentTeamDelegateMap[agent.id] ??= {};
              subAgentTeamDelegateMap[agent.id][relationshipId] = relationshipData;
            } else {
              newSubAgentTeamDelegateMap[agent.id] ??= {};
              newSubAgentTeamDelegateMap[agent.id] = relationshipData;
            }
          } else {
            // Internal agents use string format
            if (!agent.canDelegateTo.includes(targetId)) {
              agent.canDelegateTo.push(targetId);
            }
          }
        } else {
          agent.canTransferTo ??= [];
          if (!agent.canTransferTo.includes(targetId)) {
            agent.canTransferTo.push(targetId);
          }
        }
      };

      // Handle edges to external agents (only delegation is allowed)
      if (isTargetExternal) {
        if (relationships.delegateSourceToTarget) {
          const relationshipId = isNodeType(targetAgentNode, NodeType.ExternalAgent)
            ? targetAgentNode.data.relationshipId || undefined
            : undefined;
          const externalAgentId = isNodeType(targetAgentNode, NodeType.ExternalAgent)
            ? targetAgentNode.data.externalAgentId
            : undefined;
          const externalAgentFormData = externalAgentId
            ? requireFormValue(
                externalAgents[externalAgentId],
                `Missing RHF external agent data for "${externalAgentId}".`
              )
            : undefined;

          addRelationship(
            sourceAgent,
            'canDelegateTo',
            targetSubAgentId,
            true, // isExternal
            false, // isTeamAgent
            externalAgentFormData?.headers,
            relationshipId
          );
        }
        continue;
      }

      // Handle edges to team agents (only delegation is allowed)
      if (isTargetTeamAgent) {
        if (relationships.delegateSourceToTarget) {
          const relationshipId = isNodeType(targetAgentNode, NodeType.TeamAgent)
            ? targetAgentNode.data.relationshipId || undefined
            : undefined;
          const teamAgentId = isNodeType(targetAgentNode, NodeType.TeamAgent)
            ? targetAgentNode.data.teamAgentId
            : undefined;
          const teamAgentFormData = teamAgentId
            ? requireFormValue(
                teamAgents[teamAgentId],
                `Missing RHF team agent data for "${teamAgentId}".`
              )
            : undefined;

          addRelationship(
            sourceAgent,
            'canDelegateTo',
            targetSubAgentId,
            false, // isExternal
            true, // isTeamAgent
            teamAgentFormData?.headers,
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

  const defaultSubAgentId = defaultSubAgentNodeId
    ? subAgentFormData?.[defaultSubAgentNodeId]?.id
    : undefined;
  const result: SerializeAgentDataType = {
    ...(defaultSubAgentId && { defaultSubAgentId }),
    subAgents,
    functionTools,
    functions,
  };

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
