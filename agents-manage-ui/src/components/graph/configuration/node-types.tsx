import { Bot, BotMessageSquare, Hammer } from 'lucide-react';
import type { MCPTool } from '@/lib/api/tools';
import { AgentNode } from '../nodes/agent-node';
import { ExternalAgentNode } from '../nodes/external-agent-node';
import { MCPNode } from '../nodes/mcp-node';
import { MCPPlaceholderNode } from '../nodes/mcp-placeholder-node';
import type { GraphModels } from './graph-types';

interface NodeData {
  name: string;
  isDefault?: boolean;
}

import type { AgentStopWhen } from '@inkeep/agents-core/client-exports';

export interface MCPNodeData extends MCPTool, Record<string, unknown> {}

// Re-export the shared type for consistency
export type { AgentStopWhen };

export interface AgentNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
  dataComponents?: string[];
  artifactComponents?: string[];
  models?: GraphModels; // Use same structure as graph
  stopWhen?: AgentStopWhen;
}

export interface ExternalAgentNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
}

export enum NodeType {
  Agent = 'agent',
  ExternalAgent = 'external-agent',
  MCP = 'mcp',
  MCPPlaceholder = 'mcp-placeholder',
}

export const nodeTypes = {
  [NodeType.Agent]: AgentNode,
  [NodeType.ExternalAgent]: ExternalAgentNode,
  [NodeType.MCP]: MCPNode,
  [NodeType.MCPPlaceholder]: MCPPlaceholderNode,
};

export const mcpNodeHandleId = 'target-mcp';
export const agentNodeSourceHandleId = 'source-agent';
export const agentNodeTargetHandleId = 'target-agent';
export const externalAgentNodeTargetHandleId = 'target-external-agent';

export const newNodeDefaults: Record<keyof typeof nodeTypes, NodeData> = {
  [NodeType.Agent]: {
    name: '',
  },
  [NodeType.ExternalAgent]: {
    name: '',
  },
  [NodeType.MCP]: {
    name: 'MCP',
  },
  [NodeType.MCPPlaceholder]: {
    name: 'Select MCP Server',
  },
};

export const nodeTypeMap = {
  [NodeType.Agent]: {
    type: NodeType.Agent,
    name: 'Agent',
    Icon: Bot,
  },
  [NodeType.ExternalAgent]: {
    type: NodeType.ExternalAgent,
    name: 'External agent',
    Icon: BotMessageSquare,
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
};
