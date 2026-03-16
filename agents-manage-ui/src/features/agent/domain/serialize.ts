import type { Edge, Node } from '@xyflow/react';
import type { z } from 'zod';
import type { AgentModels } from '@/components/agent/configuration/agent-types';
import type { A2AEdgeData } from '@/components/agent/configuration/edge-types';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import {
  type ExternalAgentNodeData,
  type FunctionToolNodeData,
  type MCPNodeData,
  NodeType,
  type TeamAgentNodeData,
} from '@/components/agent/configuration/node-types';
import type { AgentSkill, MCPRelationSchema } from '@/components/agent/form/validation';
import type { FullAgentOutput, FullAgentPayload } from '@/lib/types/agent-full';
import type { ExternalAgent } from '@/lib/types/external-agents';
import type { TeamAgent } from '@/lib/types/team-agents';

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
function processModels(modelsData?: AgentModels): AgentModels | undefined {
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

type SerializeAgentDataType = Pick<FullAgentPayload, 'subAgents' | 'functions' | 'functionTools'>;

type PartialMCPRelation = Pick<
  z.output<typeof MCPRelationSchema>,
  'selectedTools' | 'headers' | 'toolPolicies'
>;
type MCPRelationFormData = Record<string, PartialMCPRelation>;
type NodeFormData = Pick<
  FullAgentOutput,
  'externalAgents' | 'functions' | 'functionTools' | 'subAgents' | 'teamAgents'
>;

export function hydrateNodesWithFormData(nodes: Node[], formData: NodeFormData): Node[] {
  return nodes.map((node) => {
    if (node.type === NodeType.SubAgent) {
      const subAgentId = node.id;
      const subAgent = formData.subAgents[subAgentId];

      if (!subAgent) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          id: subAgent.id,
          name: subAgent.name,
          prompt: subAgent.prompt,
          description: subAgent.description,
          dataComponents: subAgent.dataComponents,
          artifactComponents: subAgent.artifactComponents,
          models: subAgent.models,
          skills: subAgent.skills,
          stopWhen: subAgent.stopWhen,
          type: subAgent.type,
        },
      };
    }

    if (node.type === NodeType.FunctionTool) {
      const nodeData = node.data as FunctionToolNodeData;
      const functionToolId = nodeData.toolId ?? node.id;
      const functionTool = formData.functionTools?.[functionToolId];

      if (!functionTool) {
        return node;
      }

      const { functionId, name, description, tempToolPolicies } = functionTool;
      const { executeCode, inputSchema, dependencies } = formData.functions?.[functionId] ?? {};

      return {
        ...node,
        data: {
          ...node.data,
          toolId: functionToolId,
          functionId,
          name,
          description,
          code: executeCode,
          inputSchema,
          dependencies,
          tempToolPolicies,
        },
      };
    }

    return node;
  });
}

/**
 * Transforms React Flow nodes and edges back into the API data structure
 */
export function serializeAgentData(
  nodes: Node[],
  edges: Edge[],
  mcpRelations?: MCPRelationFormData,
  functionToolFormData?: FullAgentOutput['functionTools'],
  externalAgentFormData?: FullAgentOutput['externalAgents'],
  teamAgentFormData?: FullAgentOutput['teamAgents']
): SerializeAgentDataType {
  const subAgents: SerializeAgentDataType['subAgents'] = {};
  const externalAgents: Record<
    string,
    ExternalAgent & { relationshipId: string | null; headers?: Record<string, string> }
  > = {};
  const teamAgents: Record<
    string,
    TeamAgent & { relationshipId: string | null; headers?: Record<string, string> }
  > = {};
  const functionTools: NonNullable<SerializeAgentDataType['functionTools']> = {};
  const functions: NonNullable<SerializeAgentDataType['functions']> = {};

  for (const node of nodes) {
    if (node.type === NodeType.SubAgent) {
      const subAgentId = (node.data.id as string) ?? node.id;
      const subAgentDataComponents = (node.data.dataComponents as string[]) || [];
      const subAgentArtifactComponents = (node.data.artifactComponents as string[]) || [];
      // Process models - only include if it has non-empty, non-whitespace values
      const modelsData = node.data.models as AgentModels | undefined;
      const processedModels = processModels(modelsData);

      const stopWhen = (node.data as any).stopWhen;

      const nodeSkills: AgentSkill[] = (node.data as any).skills;

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

        if (mcpNode && mcpNode.type === NodeType.MCP) {
          const mcpNodeData = mcpNode.data as MCPNodeData;
          const toolId = mcpNodeData.toolId;

          if (toolId) {
            const relationshipId = mcpNodeData.relationshipId;
            const relationKey = relationshipId ?? mcpNode.id;
            const relationFormData = mcpRelations?.[relationKey];
            let toolSelection = mcpNodeData.tempSelectedTools ?? null;
            if (relationFormData?.selectedTools !== undefined) {
              toolSelection = relationFormData.selectedTools;
            }

            let toolHeaders = mcpNodeData.tempHeaders ?? null;
            if (relationFormData?.headers !== undefined) {
              toolHeaders = relationFormData.headers;
            }

            let toolPolicies = mcpNodeData.tempToolPolicies ?? null;
            if (relationFormData?.toolPolicies !== undefined) {
              toolPolicies = relationFormData.toolPolicies;
            }

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

        if (functionToolNode && functionToolNode.type === NodeType.FunctionTool) {
          const nodeData = functionToolNode.data as FunctionToolNodeData & {
            code?: string;
            dependencies?: Record<string, string>;
            description?: string;
            functionId?: string;
            inputSchema?: Record<string, unknown>;
            name?: string;
            tempToolPolicies?: Record<string, { needsApproval?: boolean }> | null;
          };

          const functionToolId = nodeData.toolId || functionToolNode.id;
          const relationshipId = nodeData.relationshipId;

          const functionId = nodeData.functionId ?? functionToolId;

          functionTools[functionToolId] = {
            id: functionToolId,
            name: nodeData.name || '',
            description: nodeData.description || '',
            functionId: functionId, // Reference to existing function
          };

          // Always create function entry to ensure it exists
          functions[functionId] = {
            id: functionId,
            executeCode: nodeData.code || '',
            inputSchema: nodeData.inputSchema || {},
            dependencies: nodeData.dependencies || {},
          };

          const formToolPolicies = functionToolFormData?.[functionToolId]?.tempToolPolicies;
          const nodeToolPolicies =
            nodeData.tempToolPolicies && Object.keys(nodeData.tempToolPolicies).length > 0
              ? nodeData.tempToolPolicies
              : undefined;
          const toolPolicies = formToolPolicies ?? nodeToolPolicies;

          canUse.push({
            toolId: functionToolId,
            toolSelection: null,
            headers: null,
            ...(toolPolicies && { toolPolicies }),
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
    } else if (node.type === NodeType.ExternalAgent) {
      const nodeData = node.data as ExternalAgentNodeData;
      const externalAgentId = nodeData.id || node.id;
      const headers =
        externalAgentFormData?.[externalAgentId]?.headers ?? nodeData.tempHeaders ?? undefined;

      const externalAgent: ExternalAgent & {
        headers?: Record<string, string>;
        relationshipId: string | null;
      } = {
        id: externalAgentId,
        name: nodeData.name as string,
        description: (nodeData.description as string) || '',
        baseUrl: nodeData.baseUrl as string,
        createdAt: nodeData.createdAt as string,
        updatedAt: nodeData.updatedAt as string,
        credentialReferenceId: (nodeData.credentialReferenceId as string) || null,
        headers,
        relationshipId: nodeData.relationshipId || null,
      };

      externalAgents[externalAgentId] = externalAgent;
    } else if (node.type === NodeType.TeamAgent) {
      const nodeData = node.data as TeamAgentNodeData;
      const teamAgentId = nodeData.id || node.id;
      const headers =
        teamAgentFormData?.[teamAgentId]?.headers ?? nodeData.tempHeaders ?? undefined;
      const teamAgent: TeamAgent & {
        relationshipId: string | null;
        headers?: Record<string, string>;
      } = {
        id: teamAgentId,
        name: nodeData.name as string,
        description: (nodeData.description as string) || '',
        headers,
        relationshipId: nodeData.relationshipId || null,
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
            subAgentExternalDelegateMap[subAgentId] ??= {};
            if (delegate.subAgentExternalAgentRelationId) {
              subAgentExternalDelegateMap[subAgentId][delegate.subAgentExternalAgentRelationId] =
                delegate;
            }
          } else if ('agentId' in delegate) {
            // Team agent delegation
            subAgentTeamDelegateMap[subAgentId] ??= {};
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
          const relationshipId = (targetExternalAgent as any).relationshipId as string | undefined;
          const externalAgentHeaders = (targetExternalAgent as any).headers as
            | Record<string, string>
            | undefined;

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
          const relationshipId = (targetTeamAgent as any).relationshipId as string | undefined;
          const teamAgentHeaders = (targetTeamAgent as any).headers as
            | Record<string, string>
            | undefined;

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

  const result: SerializeAgentDataType = {
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
