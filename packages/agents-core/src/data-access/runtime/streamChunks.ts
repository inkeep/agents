import { and, eq, gt, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { streamChunks } from '../../db/runtime/runtime-schema';

interface ConversationScope {
  tenantId: string;
  projectId: string;
  conversationId: string;
}

const DEFAULT_CHUNK_BATCH_LIMIT = 500;
const DEFAULT_CLEANUP_AGE_MINUTES = 60;
const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

const scopeConditions = (scope: ConversationScope) => [
  eq(streamChunks.tenantId, scope.tenantId),
  eq(streamChunks.projectId, scope.projectId),
  eq(streamChunks.conversationId, scope.conversationId),
];

export const insertStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (params: ConversationScope & { chunks: { idx: number; data: string }[] }) => {
    if (params.chunks.length === 0) return;
    await db.insert(streamChunks).values(
      params.chunks.map((chunk) => ({
        tenantId: params.tenantId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        idx: chunk.idx,
        data: chunk.data,
        isFinal: false,
      }))
    );
  };

export const markStreamComplete =
  (db: AgentsRunDatabaseClient) => async (params: ConversationScope & { finalIdx: number }) => {
    await db.insert(streamChunks).values({
      tenantId: params.tenantId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      idx: params.finalIdx,
      data: '',
      isFinal: true,
    });
  };

export const getStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (params: ConversationScope & { afterIdx?: number; limit?: number }) => {
    const conditions = scopeConditions(params);
    if (params.afterIdx !== undefined) {
      conditions.push(gt(streamChunks.idx, params.afterIdx));
    }
    return db
      .select({ idx: streamChunks.idx, data: streamChunks.data, isFinal: streamChunks.isFinal })
      .from(streamChunks)
      .where(and(...conditions))
      .orderBy(streamChunks.idx)
      .limit(params.limit ?? DEFAULT_CHUNK_BATCH_LIMIT);
  };

export const deleteStreamChunks =
  (db: AgentsRunDatabaseClient) => async (params: ConversationScope) => {
    await db.delete(streamChunks).where(and(...scopeConditions(params)));
  };

export const cleanupExpiredStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (
    olderThanMinutes = DEFAULT_CLEANUP_AGE_MINUTES,
    batchSize = DEFAULT_CLEANUP_BATCH_SIZE
  ) => {
    const cutoff = sql`now() - make_interval(mins => ${olderThanMinutes})`;
    let deleted: number;
    do {
      const batch = await db
        .select({
          tenantId: streamChunks.tenantId,
          projectId: streamChunks.projectId,
          conversationId: streamChunks.conversationId,
          idx: streamChunks.idx,
        })
        .from(streamChunks)
        .where(sql`${streamChunks.createdAt} < ${cutoff}`)
        .limit(batchSize);

      deleted = batch.length;
      if (deleted > 0) {
        const pks = batch.map(
          (row) => sql`(${row.tenantId}, ${row.projectId}, ${row.conversationId}, ${row.idx})`
        );
        await db
          .delete(streamChunks)
          .where(
            sql`(${streamChunks.tenantId}, ${streamChunks.projectId}, ${streamChunks.conversationId}, ${streamChunks.idx}) IN (${sql.join(pks, sql`, `)})`
          );
      }
    } while (deleted >= batchSize);
  };
