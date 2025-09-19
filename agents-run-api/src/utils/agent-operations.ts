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
 * Unified error event structure
 * Can be used for both operational errors (with agent context) and general stream errors
 */
export interface ErrorEvent {
  type: 'error';
  message: string;
  agent?: string;
  severity?: 'error' | 'warning' | 'info';
  code?: string;
  timestamp?: number;
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
 * Discriminated union of all operation events
 */
export type OperationEvent =
  | AgentInitializingEvent
  | AgentReadyEvent
  | AgentThinkingEvent
  | CompletionEvent
  | ErrorEvent;

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
 * Creates a unified error event
 * @param message - Error message
 * @param agentId - Optional agent ID for context
 * @param severity - Error severity level
 * @param code - Optional error code
 */
export function errorOp(
  message: string, 
  agentId?: string, 
  severity: 'error' | 'warning' | 'info' = 'error',
  code?: string
): ErrorEvent {
  return {
    type: 'error',
    message,
    agent: agentId,
    severity,
    code,
    timestamp: Date.now(),
  };
}

/**
 * Generate a unique tool execution ID for lifecycle tracking
 */
export function generateToolId(): string {
  return `tool_${nanoid(8)}`;
}

