import { and, eq, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { toolApprovalDecisions } from '../../db/runtime/runtime-schema';

interface ToolApprovalScope {
  tenantId: string;
  projectId: string;
  conversationId: string;
}

// Approvals time out after 10 minutes (see PendingToolApprovalManager), so a
// decision older than this can never reach a live waiter and is safe to sweep.
const DEFAULT_CLEANUP_AGE_MINUTES = 15;
const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

const decisionConditions = (scope: ToolApprovalScope, toolCallId: string) => [
  eq(toolApprovalDecisions.tenantId, scope.tenantId),
  eq(toolApprovalDecisions.projectId, scope.projectId),
  eq(toolApprovalDecisions.conversationId, scope.conversationId),
  eq(toolApprovalDecisions.toolCallId, toolCallId),
];

/**
 * Persist an approval/denial so the instance running the suspended agent can
 * pick it up. Used when the approval request lands on a different instance than
 * the one holding the in-memory pending approval. Upserts so a retry/re-submit
 * overwrites rather than conflicts.
 */
export const recordToolApprovalDecision =
  (db: AgentsRunDatabaseClient) =>
  async (
    params: ToolApprovalScope & { toolCallId: string; approved: boolean; reason?: string }
  ): Promise<void> => {
    await db
      .insert(toolApprovalDecisions)
      .values({
        tenantId: params.tenantId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        toolCallId: params.toolCallId,
        approved: params.approved,
        reason: params.reason ?? null,
      })
      .onConflictDoUpdate({
        target: [
          toolApprovalDecisions.tenantId,
          toolApprovalDecisions.projectId,
          toolApprovalDecisions.conversationId,
          toolApprovalDecisions.toolCallId,
        ],
        set: { approved: params.approved, reason: params.reason ?? null },
      });
  };

/**
 * Atomically read-and-delete a pending decision for a tool call. Returns null
 * when none is present. The delete-on-read (DELETE ... RETURNING) guarantees a
 * single waiter consumes any given decision exactly once.
 */
export const consumeToolApprovalDecision =
  (db: AgentsRunDatabaseClient) =>
  async (
    params: ToolApprovalScope & { toolCallId: string }
  ): Promise<{ approved: boolean; reason: string | null } | null> => {
    const [row] = await db
      .delete(toolApprovalDecisions)
      .where(and(...decisionConditions(params, params.toolCallId)))
      .returning();
    if (!row) return null;
    return { approved: row.approved, reason: row.reason ?? null };
  };

/**
 * Delete decisions older than the timeout window. Batched to bound statement
 * size, mirroring cleanupExpiredStreamChunks.
 */
export const cleanupExpiredToolApprovalDecisions =
  (db: AgentsRunDatabaseClient) =>
  async (
    olderThanMinutes = DEFAULT_CLEANUP_AGE_MINUTES,
    batchSize = DEFAULT_CLEANUP_BATCH_SIZE
  ): Promise<void> => {
    const cutoff = sql`now() - make_interval(mins => ${olderThanMinutes})`;
    let deleted: number;
    do {
      const batch = await db
        .select({
          tenantId: toolApprovalDecisions.tenantId,
          projectId: toolApprovalDecisions.projectId,
          conversationId: toolApprovalDecisions.conversationId,
          toolCallId: toolApprovalDecisions.toolCallId,
        })
        .from(toolApprovalDecisions)
        .where(sql`${toolApprovalDecisions.createdAt} < ${cutoff}`)
        .limit(batchSize);

      deleted = batch.length;
      if (deleted > 0) {
        const pks = batch.map(
          (row) =>
            sql`(${row.tenantId}, ${row.projectId}, ${row.conversationId}, ${row.toolCallId})`
        );
        await db
          .delete(toolApprovalDecisions)
          .where(
            sql`(${toolApprovalDecisions.tenantId}, ${toolApprovalDecisions.projectId}, ${toolApprovalDecisions.conversationId}, ${toolApprovalDecisions.toolCallId}) IN (${sql.join(pks, sql`, `)})`
          );
      }
    } while (deleted >= batchSize);
  };
