import type { DataOperationEvent } from '@inkeep/agents-core';
import { generateId } from '@inkeep/agents-core';

// =============================================================================
// OPERATION EVENT TYPES
// =============================================================================

/**
 * Agent initialization operation event
 */
export interface AgentInitializingEvent {
  type: 'agent_initializing';
  details: {
    sessionId: string;
    agentId: string;
  };
}

/**
 * Completion operation event
 */
export interface CompletionEvent {
  type: 'completion';
  details: {
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
 * Discriminated union of all operation events
 */
export type OperationEvent =
  | AgentInitializingEvent
  | CompletionEvent
  | ErrorEvent
  | DataOperationEvent;

// =============================================================================
// OPERATION FUNCTIONS
// =============================================================================

/**
 * Creates an agent initializing operation
 */
export function agentInitializingOp(sessionId: string, agentId: string): AgentInitializingEvent {
  return {
    type: 'agent_initializing',
    details: {
      sessionId,
      agentId,
    },
  };
}

/**
 * Creates a completion operation
 */
export function completionOp(subAgentId: string, iterations: number): CompletionEvent {
  return {
    type: 'completion',
    details: {
      agent: subAgentId,
      iteration: iterations,
    },
  };
}

/**
 * Creates a unified error event
 * @param message - Error message
 * @param subAgentId - Optional agent ID for context
 * @param severity - Error severity level
 * @param code - Optional error code
 */
export function errorOp(
  message: string,
  subAgentId?: string,
  severity: 'error' | 'warning' | 'info' = 'error',
  code?: string
): ErrorEvent {
  return {
    type: 'error',
    message,
    agent: subAgentId,
    severity,
    code,
    timestamp: Date.now(),
  };
}

/**
 * Generate a unique tool execution ID for lifecycle tracking
 */
export function generateToolId(): string {
  return `tool_${generateId(8)}`;
}
