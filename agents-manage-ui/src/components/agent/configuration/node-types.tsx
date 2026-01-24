import type { SkillApiSelect } from '@inkeep/agents-core';
import type { SubAgentStopWhen } from '@inkeep/agents-core/client-exports';
import { Bot, Code, Globe, Hammer, Users } from 'lucide-react';
import { ExternalAgentNode } from '../nodes/external-agent-node';
import { FunctionToolNode } from '../nodes/function-tool-node';
import { MCPNode } from '../nodes/mcp-node';
import { PlaceholderNode } from '../nodes/placeholder-node';
import { SubAgentNode } from '../nodes/sub-agent-node';
import { TeamAgentNode } from '../nodes/team-agent-node';
import type { AgentModels } from './agent-types';

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

interface NodeData extends Record<string, unknown> {
  name: string;
  isDefault?: boolean;
  subAgentId?: string | null; // Optional for MCP nodes
  relationshipId?: string | null; // Optional for MCP nodes
  type?: PlaceholderType; // Optional for placeholder nodes
}

export interface AnimatedNode {
  status?: 'delegating' | 'inverted-delegating' | 'executing' | 'error' | null;
}

export interface MCPNodeData extends Record<string, unknown>, AnimatedNode {
  toolId: string;
  subAgentId?: string | null; // null when unconnected, string when connected to specific agent
  relationshipId?: string | null; // null when unconnected, maps to specific DB agent_tool_relation row
  name?: string;
  imageUrl?: string;
  provider?: string;
  tempToolPolicies?: Record<string, { needsApproval?: boolean }>;
}

export interface AgentNodeData extends Record<string, unknown>, AnimatedNode {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
  dataComponents?: string[];
  artifactComponents?: string[];
  skills: (SkillApiSelect & { index: number; alwaysLoaded: boolean })[];
  models?: AgentModels; // Use same structure as agent
  stopWhen?: SubAgentStopWhen;
  isDefault?: boolean;
}

export interface ExternalAgentNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  relationshipId?: string | null;
  credentialReferenceId?: string | null;
}

export interface FunctionToolNodeData extends Record<string, unknown>, AnimatedNode {
  functionToolId: string;
  toolId?: string;
  agentId?: string | null;
  relationshipId?: string;
  tempToolPolicies?: Record<string, { needsApproval?: boolean }>;
  name?: string;
  description?: string;
  code?: string;
  inputSchema?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
}

export interface TeamAgentNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  relationshipId?: string | null;
}

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

export const newNodeDefaults: Record<keyof typeof nodeTypes, NodeData> = {
  [NodeType.SubAgentPlaceholder]: {
    name: 'Select agent type',
    type: NodeType.SubAgentPlaceholder,
  },
  [NodeType.SubAgent]: {
    name: '',
  },
  [NodeType.ExternalAgent]: {
    name: '',
  },
  [NodeType.ExternalAgentPlaceholder]: {
    name: 'Select external agent',
    type: NodeType.ExternalAgentPlaceholder,
  },
  [NodeType.MCP]: {
    name: 'MCP',
    subAgentId: null,
    relationshipId: null,
  },
  [NodeType.MCPPlaceholder]: {
    name: 'Select MCP server',
    type: NodeType.MCPPlaceholder,
  },
  [NodeType.FunctionTool]: {
    name: 'Function Tool',
    subAgentId: null,
  },
  [NodeType.TeamAgent]: {
    name: 'Team Agent',
    subAgentId: null,
    relationshipId: null,
  },
  [NodeType.TeamAgentPlaceholder]: {
    name: 'Select team agent',
    type: NodeType.TeamAgentPlaceholder,
  },
};

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
