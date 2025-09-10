import { nanoid } from 'nanoid';
import { getLogger } from '../logger';

const logger = getLogger('ToolSessionManager');

export interface ToolResultRecord {
  toolCallId: string;
  toolName: string;
  args?: any;
  result: any;
  timestamp: number;
}

export interface ToolSession {
  sessionId: string;
  tenantId: string;
  projectId: string;
  contextId: string;
  taskId: string;
  toolResults: Map<string, ToolResultRecord>;
  createdAt: number;
}

/**
 * Manages tool execution state during agent generation sessions.
 * Allows tools to access previous tool call results within the same execution.
 */
export class ToolSessionManager {
  private static instance: ToolSessionManager;
  private sessions: Map<string, ToolSession> = new Map();
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Cleanup expired sessions every minute
    setInterval(() => this.cleanupExpiredSessions(), 60_000);
  }

  static getInstance(): ToolSessionManager {
    if (!ToolSessionManager.instance) {
      ToolSessionManager.instance = new ToolSessionManager();
    }
    return ToolSessionManager.instance;
  }

  /**
   * Create a new tool session for an agent execution
   */
  createSession(tenantId: string, projectId: string, contextId: string, taskId: string): string {
    const sessionId = nanoid();
    const session: ToolSession = {
      sessionId,
      tenantId,
      projectId,
      contextId,
      taskId,
      toolResults: new Map(),
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    logger.debug({ sessionId, tenantId, contextId, taskId }, 'Created tool session');
    return sessionId;
  }

  /**
   * Record a tool result in the session
   */
  recordToolResult(sessionId: string, toolResult: ToolResultRecord): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(
        { sessionId, toolCallId: toolResult.toolCallId },
        'Tool result recorded for unknown session'
      );
      return;
    }

    session.toolResults.set(toolResult.toolCallId, toolResult);
  }

  /**
   * Get a tool result by toolCallId within a session
   */
  getToolResult(sessionId: string, toolCallId: string): ToolResultRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId, toolCallId }, 'Requested tool result for unknown session');
      return undefined;
    }

    const result = session.toolResults.get(toolCallId);
    if (!result) {
      logger.warn(
        {
          sessionId,
          toolCallId,
          availableToolResultIds: Array.from(session.toolResults.keys()),
        },
        'Tool result not found'
      );
    }

    return result;
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): ToolSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up a session after agent execution completes
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Remove expired sessions to prevent memory leaks
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId);
      logger.debug({ sessionId }, 'Cleaned up expired tool session');
    }

    if (expiredSessions.length > 0) {
      logger.info({ expiredCount: expiredSessions.length }, 'Cleaned up expired tool sessions');
    }
  }
}

// Export singleton instance
export const toolSessionManager = ToolSessionManager.getInstance();
