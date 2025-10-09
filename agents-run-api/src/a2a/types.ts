// A2A Protocol Types based on Google's specification
import { AgentCard, type Artifact, type TaskState } from '@inkeep/agents-core';

// Re-export AgentCard from the official schema
export { AgentCard };

export interface RegisteredAgent {
  subAgentId: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  agentCard: AgentCard;
  taskHandler: (task: A2ATask) => Promise<A2ATaskResult>;
}

export interface A2ATask {
  id: string;
  input: {
    parts: Array<{
      kind: string;
      text?: string;
      data?: any;
    }>;
  };
  context?: {
    conversationId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  };
}

export interface A2ATaskResult {
  status: {
    state: TaskState;
    message?: string;
  };
  artifacts?: Artifact[];
}

// Transfer response type
export interface TransferResponse {
  type: 'transfer';
  target: string;
  task_id: string;
  reason: string;
  artifacts: Artifact[];
  original_message: string;
  context: {
    conversationId?: string;
    tenantId: string;
    transfer_context?: Artifact[];
  };
}

// JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number | null;
}

// A2A specific JSON-RPC methods
export type A2AMethod = 'agent.invoke' | 'agent.getCapabilities' | 'agent.getStatus';
