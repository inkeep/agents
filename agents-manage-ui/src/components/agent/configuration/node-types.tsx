import type { Node } from '@xyflow/react';
import { Bot, Code, Globe, Hammer, Users } from 'lucide-react';
import {
  getExternalAgentGraphKey,
  getFunctionToolGraphKey,
  getMcpGraphKey,
  getSubAgentGraphKey,
  getTeamAgentGraphKey,
} from '@/features/agent/domain/graph-keys';
import { ExternalAgentNode } from '../nodes/external-agent-node';
import { FunctionToolNode } from '../nodes/function-tool-node';
import { MCPNode } from '../nodes/mcp-node';
import { PlaceholderNode } from '../nodes/placeholder-node';
import { SubAgentNode } from '../nodes/sub-agent-node';
import { TeamAgentNode } from '../nodes/team-agent-node';

export enum NodeType {
  SubAgentPlaceholder = 'sub-agent-placeholder',
  SubAgent = 'agent',
  ExternalAgent = 'external-agent',
  TeamAgent = 'team-agent',
  TeamAgentPlaceholder = 'team-agent-placeholder',
  ExternalAgentPlaceholder = 'external-agent-placeholder',
  MCP = 'mcp',
  MCPPlaceholder = 'mcp-placeholder',
  FunctionTool = 'function-tool',
}

export type PlaceholderType =
  | NodeType.MCPPlaceholder
  | NodeType.ExternalAgentPlaceholder
  | NodeType.TeamAgentPlaceholder
  | NodeType.SubAgentPlaceholder;

export type GraphNodeStatus = 'delegating' | 'inverted-delegating' | 'executing' | 'error' | null;

interface NodeAnimation {
  status: GraphNodeStatus;
}

type StrictNodeData<T extends object> = T & Record<string, unknown>;

interface GraphIdentityFields {
  nodeKey: string;
}

interface AnimatableNodeFields extends GraphIdentityFields {
  animation?: NodeAnimation;
}

export type PlaceholderNodeData = Record<string, never>;

export type MCPNodeData = StrictNodeData<
  AnimatableNodeFields & {
    toolId: string;
  }
>;

export type AgentNodeData = StrictNodeData<AnimatableNodeFields>;

export type ExternalAgentNodeData = StrictNodeData<
  AnimatableNodeFields & {
    externalAgentId: string;
    relationshipId: string | null;
  }
>;

export type FunctionToolNodeData = StrictNodeData<
  AnimatableNodeFields & {
    toolId: string;
    subAgentId: string | null;
    relationshipId: string | null;
  }
>;

export type TeamAgentNodeData = StrictNodeData<
  AnimatableNodeFields & {
    teamAgentId: string;
    relationshipId: string | null;
  }
>;

export interface GraphNodeDataByType {
  [NodeType.SubAgentPlaceholder]: PlaceholderNodeData;
  [NodeType.SubAgent]: AgentNodeData;
  [NodeType.ExternalAgent]: ExternalAgentNodeData;
  [NodeType.TeamAgent]: TeamAgentNodeData;
  [NodeType.TeamAgentPlaceholder]: PlaceholderNodeData;
  [NodeType.ExternalAgentPlaceholder]: PlaceholderNodeData;
  [NodeType.MCP]: MCPNodeData;
  [NodeType.MCPPlaceholder]: PlaceholderNodeData;
  [NodeType.FunctionTool]: FunctionToolNodeData;
}

export type GraphNode<T extends keyof GraphNodeDataByType = keyof GraphNodeDataByType> = Node<
  GraphNodeDataByType[T],
  T
>;

export type AnimatableGraphNode =
  | GraphNode<NodeType.SubAgent>
  | GraphNode<NodeType.ExternalAgent>
  | GraphNode<NodeType.TeamAgent>
  | GraphNode<NodeType.MCP>
  | GraphNode<NodeType.FunctionTool>;

export type AnimatableGraphNodeData = AnimatableGraphNode['data'];

export const placeholderNodeLabels: Record<PlaceholderType, string> = {
  [NodeType.SubAgentPlaceholder]: 'Select agent type',
  [NodeType.ExternalAgentPlaceholder]: 'Select external agent',
  [NodeType.TeamAgentPlaceholder]: 'Select team agent',
  [NodeType.MCPPlaceholder]: 'Select MCP server',
};

export const nodeTypes = {
  [NodeType.SubAgentPlaceholder]: PlaceholderNode,
  [NodeType.SubAgent]: SubAgentNode,
  [NodeType.ExternalAgent]: ExternalAgentNode,
  [NodeType.ExternalAgentPlaceholder]: PlaceholderNode,
  [NodeType.TeamAgent]: TeamAgentNode,
  [NodeType.TeamAgentPlaceholder]: PlaceholderNode,
  [NodeType.MCP]: MCPNode,
  [NodeType.MCPPlaceholder]: PlaceholderNode,
  [NodeType.FunctionTool]: FunctionToolNode,
};

export const mcpNodeHandleId = 'target-mcp';
export const agentNodeSourceHandleId = 'source-agent';
export const agentNodeTargetHandleId = 'target-agent';
export const externalAgentNodeTargetHandleId = 'target-external-agent';
export const functionToolNodeHandleId = 'target-function-tool';
export const teamAgentNodeTargetHandleId = 'target-team-agent';

export const newNodeDefaults: {
  [T in keyof GraphNodeDataByType]: (nodeId: string) => GraphNodeDataByType[T];
} = {
  [NodeType.SubAgentPlaceholder]: () => ({}),
  [NodeType.SubAgent]: (nodeId) => ({
    nodeKey: getSubAgentGraphKey(nodeId),
  }),
  [NodeType.ExternalAgent]: (nodeId) => ({
    nodeKey: getExternalAgentGraphKey(nodeId),
    externalAgentId: nodeId,
    relationshipId: null,
  }),
  [NodeType.ExternalAgentPlaceholder]: () => ({}),
  [NodeType.MCP]: (nodeId) => ({
    nodeKey: getMcpGraphKey({ toolId: nodeId }),
    toolId: nodeId,
  }),
  [NodeType.MCPPlaceholder]: () => ({}),
  [NodeType.FunctionTool]: (nodeId) => ({
    nodeKey: getFunctionToolGraphKey({ toolId: nodeId }),
    toolId: nodeId,
    subAgentId: null,
    relationshipId: null,
  }),
  [NodeType.TeamAgent]: (nodeId) => ({
    nodeKey: getTeamAgentGraphKey(nodeId),
    teamAgentId: nodeId,
    relationshipId: null,
  }),
  [NodeType.TeamAgentPlaceholder]: () => ({}),
};

type NodeSelectionShape = Pick<Node, 'id' | 'type' | 'data'>;

export function isNodeType<T extends keyof GraphNodeDataByType>(
  node: NodeSelectionShape | Node | undefined,
  type: T
): node is GraphNode<T> | (NodeSelectionShape & { type: T; data: GraphNodeDataByType[T] }) {
  return !!node && node.type === type;
}

export function isAnimatableGraphNode(
  node?: NodeSelectionShape | Node
): node is
  | AnimatableGraphNode
  | (NodeSelectionShape & { type: AnimatableGraphNode['type']; data: AnimatableGraphNodeData }) {
  return (
    !!node &&
    (node.type === NodeType.SubAgent ||
      node.type === NodeType.ExternalAgent ||
      node.type === NodeType.TeamAgent ||
      node.type === NodeType.MCP ||
      node.type === NodeType.FunctionTool)
  );
}

export function getNodeStatus(data?: AnimatableGraphNodeData): GraphNodeStatus {
  return data?.animation?.status ?? null;
}

export function setNodeStatus<T extends AnimatableGraphNodeData>(
  data: T,
  status: GraphNodeStatus
): T {
  if (status == null) {
    const { animation: _animation, ...rest } = data;
    return rest as T;
  }

  return {
    ...data,
    animation: {
      status,
    },
  };
}

export const nodeTypeMap = {
  [NodeType.SubAgentPlaceholder]: {
    type: NodeType.SubAgentPlaceholder,
    name: 'Sub Agent',
    Icon: Bot,
  },
  [NodeType.SubAgent]: {
    type: NodeType.SubAgent,
    name: 'Sub Agent',
    Icon: Bot,
    description: 'A sub agent can be used to perform a specific task.',
  },
  [NodeType.ExternalAgent]: {
    type: NodeType.ExternalAgent,
    name: 'External Agent',
    Icon: Globe,
  },
  [NodeType.ExternalAgentPlaceholder]: {
    type: NodeType.ExternalAgentPlaceholder,
    name: 'External Agent',
    Icon: Globe,
    description: 'Connect this agent to an agent built outside of Inkeep.',
    parentPlaceholder: NodeType.SubAgentPlaceholder,
  },
  [NodeType.MCPPlaceholder]: {
    type: NodeType.MCPPlaceholder,
    name: 'MCP',
    Icon: Hammer,
  },
  [NodeType.MCP]: {
    type: NodeType.MCP,
    name: 'MCP',
    Icon: Hammer,
  },
  [NodeType.FunctionTool]: {
    type: NodeType.FunctionTool,
    name: 'Function Tool',
    Icon: Code,
  },
  [NodeType.TeamAgent]: {
    type: NodeType.TeamAgent,
    name: 'Team Agent',
    Icon: Users,
  },
  [NodeType.TeamAgentPlaceholder]: {
    type: NodeType.TeamAgentPlaceholder,
    name: 'Team Agent',
    Icon: Users,
    description: 'Connect this agent to another agent within your project.',
    parentPlaceholder: NodeType.SubAgentPlaceholder,
  },
} as const;
