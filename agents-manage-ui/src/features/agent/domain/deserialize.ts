import type { Edge, Node } from '@xyflow/react';
import * as dagre from 'dagre';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import {
  agentNodeSourceHandleId,
  agentNodeTargetHandleId,
  externalAgentNodeTargetHandleId,
  functionToolNodeHandleId,
  mcpNodeHandleId,
  NodeType,
  teamAgentNodeTargetHandleId,
} from '@/components/agent/configuration/node-types';
import type { FullAgentDefinition } from '@/lib/types/agent-full';
import { formatJsonField } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-utils';

interface TransformResult {
  nodes: Node[];
  edges: Edge[];
}

export const NODE_WIDTH = 300;
const BASE_NODE_HEIGHT = 150;
const MIN_NODE_HEIGHT = 120;

function calculateNodeHeight(node: Node): number {
  // Base height for all nodes
  let height = MIN_NODE_HEIGHT;

  // Agent and External Agent nodes have dynamic height
  if (node.type === NodeType.SubAgent || node.type === NodeType.ExternalAgent) {
    const data = node.data as any;

    // Add height for description if it exists
    if (data.description) {
      height += 20;
    }

    // Add height for model badge if present
    if (data.models?.base?.model) {
      height += 30;
    }

    // Add height for components section
    if (data.dataComponents && data.dataComponents.length > 0) {
      // Title + items section
      height += 60 + Math.ceil(data.dataComponents.length / 3) * 30;
    }

    // Add height for artifacts section
    if (data.artifactComponents && data.artifactComponents.length > 0) {
      // Title + items section
      height += 60 + Math.ceil(data.artifactComponents.length / 3) * 30;
    }
  }

  // MCP nodes are typically smaller
  if (node.type === NodeType.MCP) {
    height = 100;
  }

  return Math.max(height, BASE_NODE_HEIGHT);
}

export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep: 150,
    ranksep: 150, // Increased vertical spacing between ranks
    edgesep: 80,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Set nodes with calculated heights
  for (const node of nodes) {
    const nodeHeight = calculateNodeHeight(node);
    g.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const nodeHeight = calculateNodeHeight(node);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
}

export function deserializeAgentData(data: FullAgentDefinition): TransformResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const createdExternalAgentNodes = new Set<string>();
  const createdTeamAgentNodes = new Set<string>();

  const subAgentIds: string[] = Object.keys(data.subAgents);
  for (const subAgentId of subAgentIds) {
    const subAgent = data.subAgents[subAgentId];
    const isDefault = subAgentId === data.defaultSubAgentId;

    const nodeType = NodeType.SubAgent;
    const agentNodeData = (() => {
      return {
        id: subAgent.id,
        name: subAgent.name,
        isDefault,
        prompt: subAgent.prompt,
        description: subAgent.description,
        dataComponents: subAgent.dataComponents,
        artifactComponents: subAgent.artifactComponents,
        models: subAgent.models
          ? {
              base: subAgent.models.base
                ? {
                    model: subAgent.models.base.model ?? '',
                    providerOptions: subAgent.models.base.providerOptions
                      ? formatJsonField(subAgent.models.base.providerOptions)
                      : undefined,
                  }
                : undefined,
              structuredOutput: subAgent.models.structuredOutput
                ? {
                    model: subAgent.models.structuredOutput.model ?? '',
                    providerOptions: subAgent.models.structuredOutput.providerOptions
                      ? formatJsonField(subAgent.models.structuredOutput.providerOptions)
                      : undefined,
                  }
                : undefined,
              summarizer: subAgent.models.summarizer
                ? {
                    model: subAgent.models.summarizer.model ?? '',
                    providerOptions: subAgent.models.summarizer.providerOptions
                      ? formatJsonField(subAgent.models.summarizer.providerOptions)
                      : undefined,
                  }
                : undefined,
            }
          : undefined,
        stopWhen: subAgent.stopWhen ? { stepCountIs: subAgent.stopWhen.stepCountIs } : undefined,
        type: subAgent.type,
        tools: subAgent.canUse ? subAgent.canUse.map((item) => item.toolId) : [],
        selectedTools: subAgent.canUse
          ? subAgent.canUse.reduce(
              (acc, item) => {
                if (item.toolSelection) {
                  acc[item.toolId] = item.toolSelection;
                }
                return acc;
              },
              {} as Record<string, string[]>
            )
          : undefined,
        headers: subAgent.canUse
          ? subAgent.canUse.reduce(
              (acc, item) => {
                if (item.headers) {
                  acc[item.toolId] = item.headers;
                }
                return acc;
              },
              {} as Record<string, Record<string, string>>
            )
          : undefined,
      };
    })();

    const agentNode: Node = {
      id: subAgentId,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: agentNodeData,
      deletable: !isDefault,
    };
    nodes.push(agentNode);
  }

  for (const subAgentId of subAgentIds) {
    const agent = data.subAgents[subAgentId];
    if ('canUse' in agent && agent.canUse && agent.canUse.length > 0) {
      for (const canUseItem of agent.canUse) {
        const toolId = canUseItem.toolId;
        const toolNodeId = generateId();
        const relationshipId = canUseItem.agentToolRelationId;

        const tool = data.tools?.[toolId] || data.functionTools?.[toolId];

        // Determine node type based on tool type
        const nodeType = data.tools?.[toolId] ? NodeType.MCP : NodeType.FunctionTool;

        // Populate node data with tool details from lookup
        const nodeData: any = {
          toolId,
          subAgentId,
          relationshipId,
          // Add tool details from lookup for proper display
          name: tool?.name,
          description: tool?.description,
          imageUrl: (tool as any)?.imageUrl,
        };

        // Add function details for function tools
        if (nodeType === NodeType.FunctionTool && data.functionTools?.[toolId]) {
          const functionTool = data.functionTools[toolId];
          const functionId = functionTool.functionId;
          if (functionId) {
            nodeData.functionId = functionId; // Store functionId in node data
            const func = data.functions?.[functionId];
            if (func) {
              nodeData.inputSchema = func.inputSchema;
              nodeData.code = func.executeCode;
              nodeData.dependencies = func.dependencies;
            }
          }
        }

        if (!tool) {
          // Tool not found - skip
          continue;
        }

        const toolNode: Node = {
          id: toolNodeId,
          type: nodeType,
          position: { x: 0, y: 0 },
          data: nodeData,
        };
        nodes.push(toolNode);

        // Use the appropriate handle ID based on tool type
        const targetHandle =
          nodeType === NodeType.FunctionTool ? functionToolNodeHandleId : mcpNodeHandleId;

        const agentToToolEdge: Edge = {
          id: `edge-${toolNodeId}-${subAgentId}`,
          type: EdgeType.Default,
          source: subAgentId,
          sourceHandle: agentNodeSourceHandleId,
          target: toolNodeId,
          targetHandle,
        };
        edges.push(agentToToolEdge);
      }
    }
  }

  const processedPairs = new Set<string>();
  for (const sourceSubAgentId of subAgentIds) {
    const sourceAgent = data.subAgents[sourceSubAgentId];

    if ('canTransferTo' in sourceAgent && sourceAgent.canTransferTo) {
      for (const targetSubAgentId of sourceAgent.canTransferTo) {
        if (data.subAgents[targetSubAgentId]) {
          // Special handling for self-referencing edges
          const isSelfReference = sourceSubAgentId === targetSubAgentId;
          const pairKey = isSelfReference
            ? `self-${sourceSubAgentId}`
            : [sourceSubAgentId, targetSubAgentId].sort().join('-');

          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            const targetAgent = data.subAgents[targetSubAgentId];

            const sourceCanTransferToTarget =
              ('canTransferTo' in sourceAgent &&
                sourceAgent.canTransferTo?.includes(targetSubAgentId)) ||
              false;
            const targetCanTransferToSource =
              ('canTransferTo' in targetAgent &&
                targetAgent.canTransferTo?.includes(sourceSubAgentId)) ||
              false;
            const sourceCanDelegateToTarget =
              ('canDelegateTo' in sourceAgent &&
                sourceAgent.canDelegateTo?.some((item) =>
                  typeof item === 'string' ? item === targetSubAgentId : false
                )) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.some((item) =>
                  typeof item === 'string' ? item === sourceSubAgentId : false
                )) ||
              false;

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceSubAgentId}`
                : `edge-${targetSubAgentId}-${sourceSubAgentId}`,
              type: isSelfReference ? EdgeType.SelfLoop : EdgeType.A2A,
              source: sourceSubAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetSubAgentId,
              targetHandle: agentNodeTargetHandleId,
              selected: false,
              data: {
                relationships: {
                  transferTargetToSource: targetCanTransferToSource,
                  transferSourceToTarget: sourceCanTransferToTarget,
                  delegateTargetToSource: targetCanDelegateToSource,
                  delegateSourceToTarget: sourceCanDelegateToTarget,
                },
              },
            } as Edge;
            edges.push(edge);
          }
        }
      }
    }

    if ('canDelegateTo' in sourceAgent && sourceAgent.canDelegateTo) {
      for (const targetSubAgent of sourceAgent.canDelegateTo) {
        let targetSubAgentId: string;
        let isTargetExternal: boolean;
        let isTargetTeamAgent: boolean;
        let headers: Record<string, string> | undefined;
        let relationshipId: string | undefined;

        if (typeof targetSubAgent === 'object' && 'externalAgentId' in targetSubAgent) {
          targetSubAgentId = targetSubAgent.externalAgentId;
          isTargetExternal = true;
          isTargetTeamAgent = false;
          headers = targetSubAgent.headers ?? undefined;
          relationshipId = targetSubAgent.subAgentExternalAgentRelationId;

          // Create external agent node if it doesn't exist
          if (!createdExternalAgentNodes.has(targetSubAgentId)) {
            const externalAgent = data.externalAgents?.[targetSubAgentId];
            if (externalAgent) {
              const externalAgentNode: Node = {
                id: targetSubAgentId,
                type: NodeType.ExternalAgent,
                position: { x: 0, y: 0 },
                data: {
                  id: externalAgent.id,
                  name: externalAgent.name,
                  description: externalAgent.description || '',
                  baseUrl: externalAgent.baseUrl,
                  credentialReferenceId: externalAgent.credentialReferenceId,
                  relationshipId,
                  tempHeaders: headers,
                },
              };
              nodes.push(externalAgentNode);
              createdExternalAgentNodes.add(targetSubAgentId);
            }
          }

          // Create edge from source agent to external agent
          const edge: Edge = {
            id: `edge-${sourceSubAgentId}-${targetSubAgentId}`,
            type: EdgeType.A2AExternal,
            source: sourceSubAgentId,
            sourceHandle: agentNodeSourceHandleId,
            target: targetSubAgentId,
            targetHandle: externalAgentNodeTargetHandleId,
            selected: false,
            data: {
              relationships: {
                transferTargetToSource: false,
                transferSourceToTarget: false,
                delegateTargetToSource: false,
                delegateSourceToTarget: true,
              },
            },
          };
          edges.push(edge);
        } else if (typeof targetSubAgent === 'object' && 'agentId' in targetSubAgent) {
          // Handle team agent delegation
          targetSubAgentId = targetSubAgent.agentId;
          isTargetExternal = false;
          isTargetTeamAgent = true;
          headers = targetSubAgent.headers ?? undefined;
          relationshipId = targetSubAgent.subAgentTeamAgentRelationId;

          // Create team agent node if it doesn't exist
          if (!createdTeamAgentNodes.has(targetSubAgentId)) {
            const teamAgent = data.teamAgents?.[targetSubAgentId];
            if (teamAgent) {
              const teamAgentNode: Node = {
                id: targetSubAgentId,
                type: NodeType.TeamAgent,
                position: { x: 0, y: 0 },
                data: {
                  id: targetSubAgentId,
                  name: teamAgent.name,
                  description: teamAgent.description,
                  relationshipId,
                  tempHeaders: headers,
                },
              };
              nodes.push(teamAgentNode);
              createdTeamAgentNodes.add(targetSubAgentId);
            }
          }

          // Create edge from source agent to team agent
          const edge: Edge = {
            id: `edge-${sourceSubAgentId}-${targetSubAgentId}`,
            type: EdgeType.A2ATeam, // Use same edge type as external agents
            source: sourceSubAgentId,
            sourceHandle: agentNodeSourceHandleId,
            target: targetSubAgentId,
            targetHandle: teamAgentNodeTargetHandleId,
            selected: false,
            data: {
              relationships: {
                transferTargetToSource: false,
                transferSourceToTarget: false,
                delegateTargetToSource: false,
                delegateSourceToTarget: true,
              },
            },
          };
          edges.push(edge);
        } else {
          targetSubAgentId = targetSubAgent;
          isTargetExternal = false;
          isTargetTeamAgent = false;
        }

        if (!isTargetExternal && !isTargetTeamAgent && data.subAgents[targetSubAgentId]) {
          // Special handling for self-referencing edges
          const isSelfReference = sourceSubAgentId === targetSubAgentId;
          const pairKey = isSelfReference
            ? `self-${sourceSubAgentId}`
            : [sourceSubAgentId, targetSubAgentId].sort().join('-');

          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            const targetAgent = data.subAgents[targetSubAgentId];

            const sourceCanTransferToTarget =
              ('canTransferTo' in sourceAgent &&
                sourceAgent.canTransferTo?.includes(targetSubAgentId)) ||
              false;
            const targetCanTransferToSource =
              ('canTransferTo' in targetAgent &&
                targetAgent.canTransferTo?.includes(sourceSubAgentId)) ||
              false;
            const sourceCanDelegateToTarget =
              ('canDelegateTo' in sourceAgent &&
                sourceAgent.canDelegateTo?.some((item) =>
                  typeof item === 'string' ? item === targetSubAgentId : false
                )) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.some((item) =>
                  typeof item === 'string' ? item === sourceSubAgentId : false
                )) ||
              false;

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceSubAgentId}`
                : `edge-${targetSubAgentId}-${sourceSubAgentId}`,
              type: isSelfReference ? EdgeType.SelfLoop : EdgeType.A2A,
              source: sourceSubAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetSubAgentId,
              targetHandle: agentNodeTargetHandleId,
              selected: false,
              data: {
                relationships: {
                  transferTargetToSource: targetCanTransferToSource,
                  transferSourceToTarget: sourceCanTransferToTarget,
                  delegateTargetToSource: targetCanDelegateToSource,
                  delegateSourceToTarget: sourceCanDelegateToTarget,
                },
              },
            } as Edge;
            edges.push(edge);
          }
        }
      }
    }
  }

  const positionedNodes = applyDagreLayout(nodes, edges);
  return { nodes: positionedNodes, edges };
}
