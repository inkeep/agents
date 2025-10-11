import type { Edge } from '@xyflow/react';
import { ArrowRightLeft } from 'lucide-react';
import { AgentToAgentEdge } from '../edges/agent-to-agent-edge';
import { DefaultEdge } from '../edges/default-edge';
import { SelfLoopEdge } from '../edges/self-loop-edge';

export enum A2AEdgeType {
  Transfer = 'transfer',
  Delegate = 'delegate',
}

export enum EdgeType {
  A2A = 'a2a',
  A2AExternal = 'a2a-external',
  Default = 'default',
  SelfLoop = 'self-loop',
}

export type A2AEdgeData = {
  relationships: {
    transferTargetToSource: boolean;
    transferSourceToTarget: boolean;
    delegateTargetToSource: boolean;
    delegateSourceToTarget: boolean;
  };
};

export const edgeTypes = {
  [EdgeType.A2A]: AgentToAgentEdge,
  [EdgeType.Default]: DefaultEdge,
  [EdgeType.A2AExternal]: DefaultEdge,
  [EdgeType.SelfLoop]: SelfLoopEdge,
} as const;

export type EdgeTypesMap = typeof edgeTypes;

export const edgeTypeMap = {
  [EdgeType.A2A]: {
    type: EdgeType.A2A,
    name: 'Agent connection',
    Icon: ArrowRightLeft,
  },
} as const;

export const initialEdges: Edge[] = [];
