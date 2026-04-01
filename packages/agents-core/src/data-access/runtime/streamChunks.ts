import { and, eq, gt, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { streamChunks } from '../../db/runtime/runtime-schema';

interface StreamScope {
  tenantId: string;
  projectId: string;
  conversationId: string;
}

export const insertStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (params: StreamScope & { chunks: { idx: number; data: string }[] }) => {
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
  (db: AgentsRunDatabaseClient) => async (params: StreamScope & { finalIdx: number }) => {
    await db.insert(streamChunks).values({
      tenantId: params.tenantId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      idx: params.finalIdx,
      data: '',
      isFinal: true,
    });
  };

const DEFAULT_CHUNK_BATCH_LIMIT = 500;

export const getStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (params: StreamScope & { afterIdx?: number; limit?: number }) => {
    const conditions = [
      eq(streamChunks.tenantId, params.tenantId),
      eq(streamChunks.projectId, params.projectId),
      eq(streamChunks.conversationId, params.conversationId),
    ];
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

export const deleteStreamChunks = (db: AgentsRunDatabaseClient) => async (params: StreamScope) => {
  await db
    .delete(streamChunks)
    .where(
      and(
        eq(streamChunks.tenantId, params.tenantId),
        eq(streamChunks.projectId, params.projectId),
        eq(streamChunks.conversationId, params.conversationId)
      )
    );
};

export const cleanupExpiredStreamChunks =
  (db: AgentsRunDatabaseClient) =>
  async (olderThanMinutes = 5) => {
    const cutoff = sql`now() - make_interval(mins => ${olderThanMinutes})`;
    await db.delete(streamChunks).where(sql`${streamChunks.createdAt} < ${cutoff}`);
  };
