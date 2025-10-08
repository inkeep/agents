import { Bot, BotMessageSquare, Code, Hammer } from 'lucide-react';
import { AgentNode } from '../nodes/agent-node';
import { ExternalAgentNode } from '../nodes/external-agent-node';
import { FunctionToolNode } from '../nodes/function-tool-node';
import { MCPNode } from '../nodes/mcp-node';
import { MCPPlaceholderNode } from '../nodes/mcp-placeholder-node';
import type { GraphModels } from './graph-types';

interface NodeData {
  name: string;
  isDefault?: boolean;
  agentId?: string | null; // Optional for MCP nodes
  relationshipId?: string | null; // Optional for MCP nodes
}

import type { AgentStopWhen } from '@inkeep/agents-core/client-exports';

export interface MCPNodeData extends Record<string, unknown> {
  toolId: string;
  agentId?: string | null; // null when unconnected, string when connected to specific agent
  relationshipId?: string | null; // null when unconnected, maps to specific DB agent_tool_relation row
  name?: string;
  imageUrl?: string;
  provider?: string;
}

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
  headers: string;
  credentialReferenceId?: string | null;
}

export interface FunctionToolNodeData extends Record<string, unknown> {
  functionToolId: string;
  agentId?: string | null; // null when unconnected, string when connected to specific agent
  name?: string;
  description?: string;
  code?: string;
  inputSchema?: Record<string, unknown>;
}

export enum NodeType {
  Agent = 'agent',
  ExternalAgent = 'external-agent',
  MCP = 'mcp',
  MCPPlaceholder = 'mcp-placeholder',
  FunctionTool = 'function-tool',
}

export const nodeTypes = {
  [NodeType.Agent]: AgentNode,
  [NodeType.ExternalAgent]: ExternalAgentNode,
  [NodeType.MCP]: MCPNode,
  [NodeType.MCPPlaceholder]: MCPPlaceholderNode,
  [NodeType.FunctionTool]: FunctionToolNode,
};

export const mcpNodeHandleId = 'target-mcp';
export const agentNodeSourceHandleId = 'source-agent';
export const agentNodeTargetHandleId = 'target-agent';
export const externalAgentNodeTargetHandleId = 'target-external-agent';
export const functionToolNodeHandleId = 'target-function-tool';

export const newNodeDefaults: Record<keyof typeof nodeTypes, NodeData> = {
  [NodeType.Agent]: {
    name: '',
  },
  [NodeType.ExternalAgent]: {
    name: '',
  },
  [NodeType.MCP]: {
    name: 'MCP',
    agentId: null,
    relationshipId: null,
  },
  [NodeType.MCPPlaceholder]: {
    name: 'Select MCP server',
  },
  [NodeType.FunctionTool]: {
    name: 'Function Tool',
    agentId: null,
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
  [NodeType.FunctionTool]: {
    type: NodeType.FunctionTool,
    name: 'Function Tool',
    Icon: Code,
  },
};
