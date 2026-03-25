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
import type { FullAgentPayload, FullAgentResponse } from '@/components/agent/form/validation';
import { getFunctionToolGraphKey, getMcpGraphKey } from './graph-identity';

interface TransformResult {
  nodes: Node[];
  edges: Edge[];
}

type AgentGraphData =
  | Pick<
      FullAgentPayload,
      | 'subAgents'
      | 'defaultSubAgentId'
      | 'tools'
      | 'functionTools'
      | 'functions'
      | 'externalAgents'
      | 'teamAgents'
    >
  | Pick<
      FullAgentResponse,
      | 'subAgents'
      | 'defaultSubAgentId'
      | 'tools'
      | 'functionTools'
      | 'functions'
      | 'externalAgents'
      | 'teamAgents'
    >;

export const NODE_WIDTH = 300;
const BASE_NODE_HEIGHT = 150;
const MIN_NODE_HEIGHT = 120;

interface NodeLayoutMetrics {
  hasBaseModel?: boolean;
  description?: string | null;
  dataComponentCount?: number;
  artifactComponentCount?: number;
}

type NodeHeights = Map<string, number>;

function calculateNodeHeightFromLayoutMetrics(
  nodeType: Node['type'],
  metrics?: NodeLayoutMetrics
): number {
  // Base height for all nodes
  let height = MIN_NODE_HEIGHT;

  // Agent and External Agent nodes have dynamic height
  if (nodeType === NodeType.SubAgent || nodeType === NodeType.ExternalAgent) {
    // Add height for description if it exists
    if (metrics?.description) {
      height += 20;
    }

    // Add height for model badge if present
    if (metrics?.hasBaseModel) {
      height += 30;
    }

    // Add height for components section
    if (metrics?.dataComponentCount) {
      // Title + items section
      height += 60 + Math.ceil(metrics.dataComponentCount / 3) * 30;
    }

    // Add height for artifacts section
    if (metrics?.artifactComponentCount) {
      // Title + items section
      height += 60 + Math.ceil(metrics.artifactComponentCount / 3) * 30;
    }
  }

  // MCP nodes are typically smaller
  if (nodeType === NodeType.MCP) {
    height = 100;
  }

  return Math.max(height, BASE_NODE_HEIGHT);
}

function setNodeHeight(
  nodeHeights: NodeHeights,
  nodeId: string,
  nodeType: Node['type'],
  metrics?: NodeLayoutMetrics
): void {
  nodeHeights.set(nodeId, calculateNodeHeightFromLayoutMetrics(nodeType, metrics));
}

function getNodeHeight(node: Node, nodeHeights: NodeHeights): number {
  return nodeHeights.get(node.id) ?? calculateNodeHeightFromLayoutMetrics(node.type);
}

function applyDagreLayout(nodes: Node[], edges: Edge[], nodeHeights: NodeHeights): Node[] {
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
    const nodeHeight = getNodeHeight(node, nodeHeights);
    g.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const nodeHeight = getNodeHeight(node, nodeHeights);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
}

export function apiToGraph(data: AgentGraphData): TransformResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeHeights: NodeHeights = new Map();
  const createdExternalAgentNodes = new Set<string>();
  const createdTeamAgentNodes = new Set<string>();

  const subAgentIds: string[] = Object.keys(data.subAgents);
  for (const subAgentId of subAgentIds) {
    const subAgent = data.subAgents[subAgentId];
    if (!subAgent) continue;
    setNodeHeight(nodeHeights, subAgentId, NodeType.SubAgent, {
      description: subAgent.description,
      hasBaseModel: Boolean(subAgent.models?.base?.model),
      dataComponentCount: subAgent.dataComponents?.length,
      artifactComponentCount: subAgent.artifactComponents?.length,
    });
    const agentNode: Node = {
      id: subAgentId,
      type: NodeType.SubAgent,
      position: { x: 0, y: 0 },
      data: {},
    };
    nodes.push(agentNode);
  }

  for (const subAgentId of subAgentIds) {
    const agent = data.subAgents[subAgentId];
    if (agent && 'canUse' in agent && agent.canUse && agent.canUse.length > 0) {
      for (const canUseItem of agent.canUse) {
        const toolId = canUseItem.toolId;
        const relationshipId = canUseItem.agentToolRelationId;

        // Determine node type based on tool type
        const nodeType = data.tools?.[toolId] ? NodeType.MCP : NodeType.FunctionTool;
        const toolNodeId =
          nodeType === NodeType.FunctionTool
            ? getFunctionToolGraphKey({ relationshipId, toolId })
            : getMcpGraphKey({ relationshipId, toolId, subAgentId });

        if (!toolNodeId) {
          continue;
        }

        const nodeData =
          nodeType === NodeType.FunctionTool
            ? {
                toolId,
                subAgentId,
                relationshipId: relationshipId ?? null,
              }
            : { toolId };

        const toolNode: Node = {
          id: toolNodeId,
          type: nodeType,
          position: { x: 0, y: 0 },
          data: nodeData,
        };
        setNodeHeight(nodeHeights, toolNodeId, nodeType);
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
    if (!sourceAgent) continue;

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
        let relationshipId: string | null = null;

        if (typeof targetSubAgent === 'object' && 'externalAgentId' in targetSubAgent) {
          targetSubAgentId = targetSubAgent.externalAgentId;
          isTargetExternal = true;
          isTargetTeamAgent = false;
          relationshipId = targetSubAgent.subAgentExternalAgentRelationId ?? null;

          // Create external agent node if it doesn't exist
          if (!createdExternalAgentNodes.has(targetSubAgentId)) {
            const externalAgent = data.externalAgents?.[targetSubAgentId];
            if (externalAgent) {
              const externalAgentNode: Node = {
                id: targetSubAgentId,
                type: NodeType.ExternalAgent,
                position: { x: 0, y: 0 },
                data: {
                  externalAgentId: targetSubAgentId,
                  relationshipId,
                },
              };
              setNodeHeight(nodeHeights, targetSubAgentId, NodeType.ExternalAgent, {
                description: externalAgent.description,
              });
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
          relationshipId = targetSubAgent.subAgentTeamAgentRelationId ?? null;

          // Create team agent node if it doesn't exist
          if (!createdTeamAgentNodes.has(targetSubAgentId)) {
            const teamAgent = data.teamAgents?.[targetSubAgentId];
            if (teamAgent) {
              const teamAgentNode: Node = {
                id: targetSubAgentId,
                type: NodeType.TeamAgent,
                position: { x: 0, y: 0 },
                data: {
                  teamAgentId: targetSubAgentId,
                  relationshipId,
                },
              };
              setNodeHeight(nodeHeights, targetSubAgentId, NodeType.TeamAgent, {
                description: teamAgent.description,
              });
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

  const positionedNodes = applyDagreLayout(nodes, edges, nodeHeights);
  return { nodes: positionedNodes, edges };
}
