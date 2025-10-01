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
    return this.createSessionWithId(sessionId, tenantId, projectId, contextId, taskId);
  }

  /**
   * Create a new tool session with a specific ID (for coordination with GraphSession)
   */
  createSessionWithId(
    sessionId: string,
    tenantId: string,
    projectId: string,
    contextId: string,
    taskId: string
  ): string {
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
    logger.debug(
      {
        sessionId,
        tenantId,
        contextId,
        taskId,
        totalSessions: this.sessions.size,
      },
      'Created tool session with ID'
    );
    return sessionId;
  }

  /**
   * Ensure a graph-scoped session exists (idempotent)
   * All agents in the same graph execution share this session
   */
  ensureGraphSession(
    sessionId: string,
    tenantId: string,
    projectId: string,
    contextId: string,
    taskId: string
  ): string {
    if (this.sessions.has(sessionId)) {
      logger.debug({ sessionId }, 'Graph session already exists, reusing');
      return sessionId;
    }

    logger.debug(
      { sessionId, tenantId, contextId, taskId },
      'Creating new graph-scoped tool session'
    );
    return this.createSessionWithId(sessionId, tenantId, projectId, contextId, taskId);
  }

  /**
   * Record a tool result in the session
   */
  recordToolResult(sessionId: string, toolResult: ToolResultRecord): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(
        {
          sessionId,
          toolCallId: toolResult.toolCallId,
          availableSessionIds: Array.from(this.sessions.keys()),
          totalSessions: this.sessions.size,
        },
        'Tool result recorded for unknown session'
      );
      return;
    }

    session.toolResults.set(toolResult.toolCallId, toolResult);
    logger.debug(
      {
        sessionId,
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
      },
      'Tool result recorded successfully'
    );
  }

  /**
   * Get a tool result by toolCallId within a session
   */
  getToolResult(sessionId: string, toolCallId: string): ToolResultRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(
        {
          sessionId,
          toolCallId,
          availableSessionIds: Array.from(this.sessions.keys()),
          totalSessions: this.sessions.size,
        },
        'Requested tool result for unknown session'
      );
      return undefined;
    }

    const result = session.toolResults.get(toolCallId);
    if (!result) {
      logger.warn(
        {
          sessionId,
          toolCallId,
          availableToolResultIds: Array.from(session.toolResults.keys()),
          totalToolResults: session.toolResults.size,
        },
        'Tool result not found'
      );
    } else {
      logger.debug(
        {
          sessionId,
          toolCallId,
          toolName: result.toolName,
        },
        'Tool result found successfully'
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
