import type { Edge, Node } from '@xyflow/react';
import * as dagre from 'dagre';
import { nanoid } from 'nanoid';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import {
  agentNodeSourceHandleId,
  agentNodeTargetHandleId,
  externalAgentNodeTargetHandleId,
  mcpNodeHandleId,
  NodeType,
} from '@/components/graph/configuration/node-types';
import type {
  ExternalAgentDefinition,
  FullGraphDefinition,
  InternalAgentDefinition,
} from '@/lib/types/graph-full';
import { formatJsonField } from '@/lib/utils';

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
  if (node.type === NodeType.Agent || node.type === NodeType.ExternalAgent) {
    const data = node.data as any;

    // Add height for description if it exists
    if (data.description) {
      height += 20;
    }

    // Add height for model badge if present
    if (data.models?.base?.model) {
      height += 30;
    }

    // Add height for data components section
    if (data.dataComponents && data.dataComponents.length > 0) {
      // Title + items section
      height += 60 + Math.ceil(data.dataComponents.length / 3) * 30;
    }

    // Add height for artifact components section
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

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new (dagre as any).graphlib.Graph();
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

  (dagre as any).layout(g);

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

export function deserializeGraphData(data: FullGraphDefinition): TransformResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const agentIds: string[] = Object.keys(data.agents);
  for (const agentId of agentIds) {
    const agent = data.agents[agentId];
    const isDefault = agentId === data.defaultAgentId;
    const isExternal = agent.type === 'external';

    const nodeType = isExternal ? NodeType.ExternalAgent : NodeType.Agent;
    const agentNodeData = isExternal
      ? {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          baseUrl: (agent as ExternalAgentDefinition).baseUrl,
          headers: formatJsonField(agent.headers) || '{}',
          type: agent.type,
          credentialReferenceId: agent.credentialReferenceId,
        }
      : (() => {
          const internalAgent = agent as InternalAgentDefinition;
          return {
            id: agent.id,
            name: agent.name,
            isDefault,
            prompt: internalAgent.prompt,
            description: agent.description,
            dataComponents: internalAgent.dataComponents,
            artifactComponents: internalAgent.artifactComponents,
            models: internalAgent.models
              ? {
                  base: internalAgent.models.base
                    ? {
                        model: internalAgent.models.base.model ?? '',
                        providerOptions: internalAgent.models.base.providerOptions
                          ? formatJsonField(internalAgent.models.base.providerOptions)
                          : undefined,
                      }
                    : undefined,
                  structuredOutput: internalAgent.models.structuredOutput
                    ? {
                        model: internalAgent.models.structuredOutput.model ?? '',
                        providerOptions: internalAgent.models.structuredOutput.providerOptions
                          ? formatJsonField(internalAgent.models.structuredOutput.providerOptions)
                          : undefined,
                      }
                    : undefined,
                  summarizer: internalAgent.models.summarizer
                    ? {
                        model: internalAgent.models.summarizer.model ?? '',
                        providerOptions: internalAgent.models.summarizer.providerOptions
                          ? formatJsonField(internalAgent.models.summarizer.providerOptions)
                          : undefined,
                      }
                    : undefined,
                }
              : undefined,
            stopWhen: internalAgent.stopWhen
              ? { stepCountIs: internalAgent.stopWhen.stepCountIs }
              : undefined,
            type: agent.type,
            // Convert canUse back to tools, selectedTools, headers for UI
            tools: internalAgent.canUse ? internalAgent.canUse.map((item) => item.toolId) : [],
            selectedTools: internalAgent.canUse
              ? internalAgent.canUse.reduce(
                  (acc, item) => {
                    if (item.toolSelection) {
                      acc[item.toolId] = item.toolSelection;
                    }
                    return acc;
                  },
                  {} as Record<string, string[]>
                )
              : undefined,
            headers: internalAgent.canUse
              ? internalAgent.canUse.reduce(
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
      id: agentId,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: agentNodeData,
      deletable: !isDefault,
    };
    nodes.push(agentNode);
  }

  // Note: Tools are now project-scoped and not included in graph data
  // Tool visualization will need to be handled at the project level
  for (const agentId of agentIds) {
    const agent = data.agents[agentId];
    // Check if agent has canUse property (internal agents)
    if ('canUse' in agent && agent.canUse && agent.canUse.length > 0) {
      // Tools are project-scoped - create nodes from canUse items
      for (const canUseItem of agent.canUse) {
        const toolId = canUseItem.toolId;
        const toolNodeId = nanoid();
        const relationshipId = canUseItem.agentToolRelationId;
        const toolNode: Node = {
          id: toolNodeId,
          type: NodeType.MCP,
          position: { x: 0, y: 0 },
          data: { toolId, agentId, relationshipId },
        };
        nodes.push(toolNode);

        const agentToToolEdge: Edge = {
          id: `edge-${toolNodeId}-${agentId}`,
          type: EdgeType.Default,
          source: agentId,
          sourceHandle: agentNodeSourceHandleId,
          target: toolNodeId,
          targetHandle: mcpNodeHandleId,
        };
        edges.push(agentToToolEdge);
      }
    }
  }

  const processedPairs = new Set<string>();
  for (const sourceAgentId of agentIds) {
    const sourceAgent = data.agents[sourceAgentId];

    // Check if agent has relationship properties (internal agents only)
    if ('canTransferTo' in sourceAgent && sourceAgent.canTransferTo) {
      for (const targetAgentId of sourceAgent.canTransferTo) {
        if (data.agents[targetAgentId]) {
          // Special handling for self-referencing edges
          const isSelfReference = sourceAgentId === targetAgentId;
          const pairKey = isSelfReference
            ? `self-${sourceAgentId}`
            : [sourceAgentId, targetAgentId].sort().join('-');

          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            const targetAgent = data.agents[targetAgentId];

            const sourceCanTransferToTarget =
              ('canTransferTo' in sourceAgent &&
                sourceAgent.canTransferTo?.includes(targetAgentId)) ||
              false;
            const targetCanTransferToSource =
              ('canTransferTo' in targetAgent &&
                targetAgent.canTransferTo?.includes(sourceAgentId)) ||
              false;
            const sourceCanDelegateToTarget =
              ('canDelegateTo' in sourceAgent &&
                sourceAgent.canDelegateTo?.includes(targetAgentId)) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.includes(sourceAgentId)) ||
              false;

            const isTargetExternal = targetAgent.type === 'external';

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceAgentId}`
                : `edge-${targetAgentId}-${sourceAgentId}`,
              type: isSelfReference
                ? EdgeType.SelfLoop
                : isTargetExternal
                  ? EdgeType.A2AExternal
                  : EdgeType.A2A,
              source: sourceAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetAgentId,
              targetHandle: isTargetExternal
                ? externalAgentNodeTargetHandleId
                : agentNodeTargetHandleId,
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
      for (const targetAgentId of sourceAgent.canDelegateTo) {
        if (data.agents[targetAgentId]) {
          // Special handling for self-referencing edges
          const isSelfReference = sourceAgentId === targetAgentId;
          const pairKey = isSelfReference
            ? `self-${sourceAgentId}`
            : [sourceAgentId, targetAgentId].sort().join('-');

          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            const targetAgent = data.agents[targetAgentId];

            const sourceCanTransferToTarget =
              ('canTransferTo' in sourceAgent &&
                sourceAgent.canTransferTo?.includes(targetAgentId)) ||
              false;
            const targetCanTransferToSource =
              ('canTransferTo' in targetAgent &&
                targetAgent.canTransferTo?.includes(sourceAgentId)) ||
              false;
            const sourceCanDelegateToTarget =
              ('canDelegateTo' in sourceAgent &&
                sourceAgent.canDelegateTo?.includes(targetAgentId)) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.includes(sourceAgentId)) ||
              false;

            const isTargetExternal = targetAgent.type === 'external';

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceAgentId}`
                : `edge-${targetAgentId}-${sourceAgentId}`,
              type: isSelfReference
                ? EdgeType.SelfLoop
                : isTargetExternal
                  ? EdgeType.A2AExternal
                  : EdgeType.A2A,
              source: sourceAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetAgentId,
              targetHandle: isTargetExternal
                ? externalAgentNodeTargetHandleId
                : agentNodeTargetHandleId,
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
