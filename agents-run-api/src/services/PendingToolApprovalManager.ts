import { getLogger } from '../logger';

const logger = getLogger('PendingToolApprovalManager');

// Cleanup interval - every 2 minutes
const APPROVAL_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

// Approval timeout - 10 minutes (same as OAuth PKCE timeout)
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export interface PendingToolApproval {
  toolCallId: string;
  toolName: string;
  args: any;
  conversationId: string;
  subAgentId: string;
  createdAt: number;
  resolve: (result: { approved: boolean; reason?: string }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Manages pending tool approval requests during agent execution.
 * Similar to ToolSessionManager but for approval workflows.
 * Uses in-memory Map storage with automatic cleanup like OAuth PKCE store.
 */
export class PendingToolApprovalManager {
  private static instance: PendingToolApprovalManager;
  private pendingApprovals: Map<string, PendingToolApproval> = new Map();

  private constructor() {
    // Cleanup expired approvals every 2 minutes
    setInterval(() => this.cleanupExpiredApprovals(), APPROVAL_CLEANUP_INTERVAL_MS);
  }

  static getInstance(): PendingToolApprovalManager {
    if (!PendingToolApprovalManager.instance) {
      PendingToolApprovalManager.instance = new PendingToolApprovalManager();
    }
    return PendingToolApprovalManager.instance;
  }

  /**
   * Create a new pending approval and return a promise that resolves with approval status
   */
  async waitForApproval(
    toolCallId: string,
    toolName: string,
    args: any,
    conversationId: string,
    subAgentId: string
  ): Promise<{ approved: boolean; reason?: string }> {
    return new Promise((resolve, reject) => {
      // Set up automatic timeout/cleanup
      const timeoutId = setTimeout(() => {
        this.pendingApprovals.delete(toolCallId);
        resolve({
          approved: false,
          reason: `Tool approval timeout for ${toolName} (${toolCallId})`,
        });
      }, APPROVAL_TIMEOUT_MS);

      const approval: PendingToolApproval = {
        toolCallId,
        toolName,
        args,
        conversationId,
        subAgentId,
        createdAt: Date.now(),
        resolve,
        reject,
        timeoutId,
      };

      this.pendingApprovals.set(toolCallId, approval);

      logger.info(
        {
          toolCallId,
          toolName,
          conversationId,
          subAgentId,
        },
        'Tool approval request created, waiting for user response'
      );
    });
  }

  /**
   * Approve a pending tool call
   */
  approveToolCall(toolCallId: string): boolean {
    const approval = this.pendingApprovals.get(toolCallId);

    if (!approval) {
      logger.warn({ toolCallId }, 'Tool approval not found or already processed');
      return false;
    }

    logger.info(
      {
        toolCallId,
        toolName: approval.toolName,
        conversationId: approval.conversationId,
      },
      'Tool approved by user, resuming execution'
    );

    // Clean up and resolve the promise with approval result
    clearTimeout(approval.timeoutId);
    this.pendingApprovals.delete(toolCallId);
    approval.resolve({ approved: true });

    return true;
  }

  /**
   * Deny a pending tool call
   */
  denyToolCall(toolCallId: string, reason?: string): boolean {
    const approval = this.pendingApprovals.get(toolCallId);

    if (!approval) {
      logger.warn({ toolCallId }, 'Tool approval not found or already processed');
      return false;
    }

    logger.info(
      {
        toolCallId,
        toolName: approval.toolName,
        conversationId: approval.conversationId,
        reason,
      },
      'Tool execution denied by user'
    );

    // Clean up and resolve the promise with denial result
    clearTimeout(approval.timeoutId);
    this.pendingApprovals.delete(toolCallId);
    approval.resolve({
      approved: false,
      reason: reason || 'User denied approval',
    });

    return true;
  }

  /**
   * Clean up expired approvals (called by interval timer)
   */
  private cleanupExpiredApprovals(): void {
    const now = Date.now();
    let cleanedUp = 0;

    for (const [toolCallId, approval] of this.pendingApprovals) {
      if (now - approval.createdAt > APPROVAL_TIMEOUT_MS) {
        clearTimeout(approval.timeoutId);
        this.pendingApprovals.delete(toolCallId);
        approval.resolve({ approved: false, reason: 'Tool approval expired' });
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      logger.info({ cleanedUp }, 'Cleaned up expired tool approvals');
    }
  }

  /**
   * Get current status for monitoring
   */
  getStatus() {
    return {
      pendingApprovals: this.pendingApprovals.size,
      approvals: Array.from(this.pendingApprovals.values()).map((approval) => ({
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        conversationId: approval.conversationId,
        subAgentId: approval.subAgentId,
        createdAt: approval.createdAt,
        age: Date.now() - approval.createdAt,
      })),
    };
  }
}

// Export singleton instance
export const pendingToolApprovalManager = PendingToolApprovalManager.getInstance();
