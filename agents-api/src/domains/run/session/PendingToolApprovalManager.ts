import { consumeToolApprovalDecision, recordToolApprovalDecision } from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('PendingToolApprovalManager');

// Cleanup interval - every 2 minutes
const APPROVAL_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

// Approval timeout - 10 minutes (same as OAuth PKCE timeout)
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

// How often a waiting instance polls the shared store for a decision that was
// submitted to a *different* instance. ~1s adds negligible latency to the
// cross-instance case; same-instance approvals never wait for a poll.
const APPROVAL_POLL_INTERVAL_MS = 1000;

export interface WaitForApprovalOptions {
  toolCallId: string;
  toolName: string;
  args: any;
  conversationId: string;
  subAgentId: string;
  tenantId: string;
  projectId: string;
}

export interface PendingToolApproval {
  toolCallId: string;
  toolName: string;
  args: any;
  tenantId: string;
  projectId: string;
  conversationId: string;
  subAgentId: string;
  createdAt: number;
  resolve: (result: { approved: boolean; reason?: string }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  // Set only when cross-instance polling is enabled (scope fields present).
  pollIntervalId?: ReturnType<typeof setInterval>;
  // Guards against overlapping polls when a DB round-trip exceeds the interval,
  // capping DB load at one in-flight query per approval.
  pollInFlight?: boolean;
  // Set synchronously the instant the approval resolves (approve/deny/timeout)
  // so an in-flight poll never delivers — or destructively consumes — a decision
  // after the fact.
  settled?: boolean;
}

/**
 * Manages pending tool approval requests during agent execution.
 * Similar to ToolSessionManager but for approval workflows.
 * Uses in-memory Map storage with automatic cleanup like OAuth PKCE store.
 *
 * Classic (non-durable) execution holds the pending approval in the memory of
 * the single instance running the agent. Because the user's approval request
 * may be load-balanced to a different instance, that instance persists the
 * decision to the shared `tool_approval_decisions` store (see chatDataStream),
 * and the waiting instance polls and consumes it here. Same-instance approvals
 * still resolve instantly in memory via approveToolCall/denyToolCall.
 */
export class PendingToolApprovalManager {
  private static instance: PendingToolApprovalManager;
  private pendingApprovals: Map<string, PendingToolApproval> = new Map();

  private constructor() {
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
    options: WaitForApprovalOptions
  ): Promise<{ approved: boolean; reason?: string }> {
    const { toolCallId, toolName, args, conversationId, subAgentId, tenantId, projectId } = options;
    return new Promise((resolve, reject) => {
      const approval: PendingToolApproval = {
        toolCallId,
        toolName,
        args,
        tenantId,
        projectId,
        conversationId,
        subAgentId,
        createdAt: Date.now(),
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          const pending = this.pendingApprovals.get(toolCallId);
          if (pending) {
            pending.settled = true;
            this.clearTimers(pending);
          }
          this.pendingApprovals.delete(toolCallId);
          resolve({
            approved: false,
            reason: `Tool approval timeout for ${toolName} (${toolCallId})`,
          });
        }, APPROVAL_TIMEOUT_MS),
      };

      // Enable cross-instance delivery only when we have a full scope to query
      // the shared store with. The approval request handler persists decisions
      // under (tenantId, projectId, conversationId, toolCallId).
      if (tenantId && projectId && conversationId) {
        approval.pollIntervalId = setInterval(() => {
          // Skip if the previous poll is still running, so a DB latency spike
          // can't stack up one query per second on top of the last.
          if (approval.pollInFlight) return;
          approval.pollInFlight = true;
          void this.pollForDecision(toolCallId).finally(() => {
            approval.pollInFlight = false;
          });
        }, APPROVAL_POLL_INTERVAL_MS);
        // The in-flight request already keeps the process alive while the agent
        // is suspended; don't let the poll timer hold the event loop on its own.
        approval.pollIntervalId.unref?.();
      }

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

    approval.settled = true;
    this.clearTimers(approval);
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

    approval.settled = true;
    this.clearTimers(approval);
    this.pendingApprovals.delete(toolCallId);
    approval.resolve({
      approved: false,
      reason: `The user declined to run this tool. ${reason ? `Reason: ${reason}` : ''}`,
    });

    return true;
  }

  /**
   * Poll the shared store for a decision submitted to another instance and, if
   * present, resolve the pending approval. Consuming is a delete-on-read so a
   * decision is applied exactly once even across instances.
   */
  private async pollForDecision(toolCallId: string): Promise<void> {
    const approval = this.pendingApprovals.get(toolCallId);
    // Bail before the destructive consume if the approval is already resolved.
    if (!approval || approval.settled) return;

    try {
      const decision = await consumeToolApprovalDecision(runDbClient)({
        tenantId: approval.tenantId,
        projectId: approval.projectId,
        conversationId: approval.conversationId,
        toolCallId,
      });
      if (!decision) return;

      // The approval may have resolved (approve/deny/timeout) while we awaited
      // the consume above. We've already deleted the row, so re-record the
      // decision rather than dropping a real user choice on the floor.
      if (approval.settled || !this.pendingApprovals.has(toolCallId)) {
        // Own try/catch: a failure here is a re-record (write) failure after a
        // successful consume — distinct from the poll/consume (read) failure the
        // outer catch reports, and it means the consumed row is gone.
        try {
          await recordToolApprovalDecision(runDbClient)({
            tenantId: approval.tenantId,
            projectId: approval.projectId,
            conversationId: approval.conversationId,
            toolCallId,
            approved: decision.approved,
            reason: decision.reason ?? undefined,
          });
          logger.warn(
            { toolCallId },
            'Tool approval decision consumed after the request already settled; re-recorded to avoid loss'
          );
        } catch (reRecordError) {
          logger.error(
            { toolCallId, error: reRecordError },
            'Failed to re-record consumed tool approval decision after settle; decision dropped'
          );
        }
        return;
      }

      logger.info(
        { toolCallId, approved: decision.approved, conversationId: approval.conversationId },
        'Tool approval delivered via shared store (cross-instance)'
      );

      if (decision.approved) {
        this.approveToolCall(toolCallId);
      } else {
        this.denyToolCall(toolCallId, decision.reason ?? undefined);
      }
    } catch (error) {
      logger.warn(
        { toolCallId, error },
        'Failed to poll shared store for cross-instance tool approval decision'
      );
    }
  }

  /**
   * Clear the timeout and (if present) the cross-instance poll for an approval.
   */
  private clearTimers(approval: PendingToolApproval): void {
    clearTimeout(approval.timeoutId);
    if (approval.pollIntervalId) {
      clearInterval(approval.pollIntervalId);
    }
  }

  /**
   * Clean up expired approvals (called by interval timer)
   */
  private cleanupExpiredApprovals(): void {
    const pendingApprovals = this.pendingApprovals;
    const now = Date.now();
    let cleanedUp = 0;

    for (const [toolCallId, approval] of pendingApprovals) {
      if (now - approval.createdAt > APPROVAL_TIMEOUT_MS) {
        approval.settled = true;
        this.clearTimers(approval);
        pendingApprovals.delete(toolCallId);
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
    const pendingApprovals = this.pendingApprovals;
    return {
      pendingApprovals: pendingApprovals.size,
      approvals: Array.from(pendingApprovals.values()).map((approval) => ({
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
