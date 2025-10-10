import type { Edge, Node } from '@xyflow/react';
import * as dagre from 'dagre';
import { nanoid } from 'nanoid';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import {
  agentNodeSourceHandleId,
  agentNodeTargetHandleId,
  externalAgentNodeTargetHandleId,
  functionToolNodeHandleId,
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

export function deserializeGraphData(data: FullGraphDefinition): TransformResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const subAgentIds: string[] = Object.keys(data.subAgents);
  for (const subAgentId of subAgentIds) {
    const agent = data.subAgents[subAgentId];
    const isDefault = subAgentId === data.defaultSubAgentId;
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
      id: subAgentId,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: agentNodeData,
      deletable: !isDefault,
    };
    nodes.push(agentNode);
  }

  // Create tool nodes from canUse items (using tools and functions lookups)
  for (const subAgentId of subAgentIds) {
    const agent = data.subAgents[subAgentId];
    // Check if agent has canUse property (internal agents)
    if ('canUse' in agent && agent.canUse && agent.canUse.length > 0) {
      for (const canUseItem of agent.canUse) {
        const toolId = canUseItem.toolId;
        const toolNodeId = nanoid();
        const relationshipId = canUseItem.agentToolRelationId;

        // Get tool details from lookup
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

    // Check if agent has relationship properties (internal agents only)
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
                sourceAgent.canDelegateTo?.includes(targetSubAgentId)) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.includes(sourceSubAgentId)) ||
              false;

            const isTargetExternal = targetAgent.type === 'external';

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceSubAgentId}`
                : `edge-${targetSubAgentId}-${sourceSubAgentId}`,
              type: isSelfReference
                ? EdgeType.SelfLoop
                : isTargetExternal
                  ? EdgeType.A2AExternal
                  : EdgeType.A2A,
              source: sourceSubAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetSubAgentId,
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
      for (const targetSubAgentId of sourceAgent.canDelegateTo) {
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
                sourceAgent.canDelegateTo?.includes(targetSubAgentId)) ||
              false;
            const targetCanDelegateToSource =
              ('canDelegateTo' in targetAgent &&
                targetAgent.canDelegateTo?.includes(sourceSubAgentId)) ||
              false;

            const isTargetExternal = targetAgent.type === 'external';

            const edge = {
              id: isSelfReference
                ? `edge-self-${sourceSubAgentId}`
                : `edge-${targetSubAgentId}-${sourceSubAgentId}`,
              type: isSelfReference
                ? EdgeType.SelfLoop
                : isTargetExternal
                  ? EdgeType.A2AExternal
                  : EdgeType.A2A,
              source: sourceSubAgentId,
              sourceHandle: agentNodeSourceHandleId,
              target: targetSubAgentId,
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
