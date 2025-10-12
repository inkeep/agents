// A2A Protocol Types based on Google's specification
import {
  AgentCard,
  type Artifact,
  type Message,
  type Task,
  type TaskState,
} from '@inkeep/agents-core';

// Re-export AgentCard from the official schema
export { AgentCard };

export interface RegisteredAgent {
  subAgentId: string;
  tenantId: string;
  projectId: string;
  agentId: string;
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

// === Transfer Types ===

/**
 * Transfer data structure - what the transfer tool returns
 * This gets wrapped into a DataPart by the AI SDK
 */
export interface TransferData {
  type: 'transfer';
  targetSubAgentId: string; // Changed from "target" for consistency with codebase naming
  fromSubAgentId?: string;
}

/**
 * Full transfer response following A2A protocol
 * The TransferData is wrapped in artifacts[0].parts[0].data
 */
export interface TransferTask extends Task {
  artifacts: Artifact[];
}

/**
 * Type guard to check if a Task contains transfer data
 */
export function isTransferTask(result: Task | Message): result is TransferTask {
  console.log(
    '[isTransferTask] Checking result:',
    JSON.stringify(
      {
        hasArtifacts: 'artifacts' in result,
        artifactsLength: result.kind === 'task' ? result.artifacts?.length : 0,
        firstArtifactParts: result.kind === 'task' ? result.artifacts?.[0]?.parts?.length : 0,
        allParts:
          result.kind === 'task'
            ? result.artifacts?.[0]?.parts?.map((p, i) => ({
                index: i,
                kind: p.kind,
                hasData: !!(p.kind === 'data' && p.data),
                dataType: p.kind === 'data' ? p.data?.type : undefined,
                dataKeys: p.kind === 'data' ? Object.keys(p.data) : [],
              }))
            : [],
      },
      null,
      2
    )
  );

  if (!('artifacts' in result) || !result.artifacts) {
    console.log('[isTransferTask] No artifacts found');
    return false;
  }

  const hasTransfer = result.artifacts.some((artifact) =>
    artifact.parts.some((part) => {
      if (part.kind !== 'data' || !part.data) return false;
      // Type-safe check without as any
      const isTransfer =
        typeof part.data === 'object' && 'type' in part.data && part.data.type === 'transfer';
      if (isTransfer) {
        console.log('[isTransferTask] Found transfer data:', JSON.stringify(part.data, null, 2));
      }
      return isTransfer;
    })
  );

  console.log('[isTransferTask] Result:', hasTransfer);
  return hasTransfer;
}

/**
 * Helper to safely extract transfer data from a TransferTask
 * Returns null if no transfer data found
 */
export function extractTransferData(task: TransferTask): TransferData | null {
  for (const artifact of task.artifacts) {
    for (const part of artifact.parts) {
      if (part.kind === 'data' && part.data?.type === 'transfer') {
        return part.data as TransferData;
      }
    }
  }
  return null;
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
