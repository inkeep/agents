import { nanoid } from 'nanoid';

// =============================================================================
// OPERATION EVENT TYPES
// =============================================================================

/**
 * Agent initialization operation event
 */
export interface AgentInitializingEvent {
  type: 'agent_initializing';
  ctx: {
    sessionId: string;
    graphId: string;
  };
}

/**
 * Agent ready operation event
 */
export interface AgentReadyEvent {
  type: 'agent_ready';
  ctx: {
    sessionId: string;
    graphId: string;
  };
}

/**
 * Completion operation event
 */
export interface CompletionEvent {
  type: 'completion';
  ctx: {
    agent: string;
    iteration: number;
  };
}

/**
 * Error operation event
 */
export interface ErrorEvent {
  type: 'error';
  ctx: {
    error: string;
    agent?: string;
  };
}

/**
 * Agent thinking operation event
 */
export interface AgentThinkingEvent {
  type: 'agent_thinking';
  ctx: {
    agent: string;
  };
}

/**
 * Status update operation event with flexible structured/unstructured data
 */
export interface StatusUpdateEvent {
  type: 'status_update';
  ctx: {
    summary?: string; // Unstructured summary text
    [key: string]: any; // Structured data from graph session
  };
}

/**
 * Discriminated union of all operation events
 */
export type OperationEvent =
  | AgentInitializingEvent
  | AgentReadyEvent
  | AgentThinkingEvent
  | CompletionEvent
  | ErrorEvent
  | StatusUpdateEvent;

// =============================================================================
// OPERATION FUNCTIONS
// =============================================================================

/**
 * Creates an agent initializing operation
 */
export function agentInitializingOp(sessionId: string, graphId: string): AgentInitializingEvent {
  return {
    type: 'agent_initializing',
    ctx: {
      sessionId,
      graphId,
    },
  };
}

/**
 * Creates an agent ready operation
 */
export function agentReadyOp(sessionId: string, graphId: string): AgentReadyEvent {
  return {
    type: 'agent_ready',
    ctx: {
      sessionId,
      graphId,
    },
  };
}

/**
 * Creates an agent thinking operation
 */
export function agentThinkingOp(agent: string): AgentThinkingEvent {
  return {
    type: 'agent_thinking',
    ctx: {
      agent,
    },
  };
}

/**
 * Creates a completion operation
 */
export function completionOp(agentId: string, iterations: number): CompletionEvent {
  return {
    type: 'completion',
    ctx: {
      agent: agentId,
      iteration: iterations,
    },
  };
}

/**
 * Creates an error operation
 */
export function errorOp(error: string, agentId?: string): ErrorEvent {
  return {
    type: 'error',
    ctx: {
      error,
      agent: agentId,
    },
  };
}

/**
 * Generate a unique tool execution ID for lifecycle tracking
 */
export function generateToolId(): string {
  return `tool_${nanoid(8)}`;
}

/**
 * Creates a status update operation with flexible data
 */
export function statusUpdateOp(ctx: Record<string, any>): StatusUpdateEvent {
  return {
    type: 'status_update',
    ctx,
  };
}
