import { and, eq, lt } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { pendingInteractions } from '../../db/runtime/runtime-schema';
import type { PendingInteractionSelect } from '../../types/entities';
import type {
  ExecutionCheckpoint,
  InteractionResponse,
  PendingInteractionData,
  PendingInteractionStatus,
  PendingInteractionType,
} from '../../types/utility';

export interface CreatePendingInteractionParams {
  id: string;
  tenantId: string;
  projectId: string;
  conversationId: string;
  taskId?: string;
  subAgentId: string;
  type: PendingInteractionType;
  status?: PendingInteractionStatus;
  interactionData: PendingInteractionData;
  checkpoint: ExecutionCheckpoint;
  expiresAt?: string;
}

export interface GetPendingInteractionParams {
  tenantId: string;
  projectId: string;
  interactionId: string;
}

export interface GetPendingInteractionsByConversationParams {
  tenantId: string;
  projectId: string;
  conversationId: string;
  status?: PendingInteractionStatus;
}

export interface UpdatePendingInteractionParams {
  tenantId: string;
  projectId: string;
  interactionId: string;
  data: {
    status?: PendingInteractionStatus;
    response?: InteractionResponse | null;
    respondedAt?: string;
  };
}

export interface RespondToInteractionParams {
  tenantId: string;
  projectId: string;
  interactionId: string;
  response: InteractionResponse;
  status: 'accepted' | 'declined' | 'cancelled';
}

export const createPendingInteraction =
  (db: AgentsRunDatabaseClient) =>
  async (params: CreatePendingInteractionParams): Promise<PendingInteractionSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(pendingInteractions)
      .values({
        id: params.id,
        tenantId: params.tenantId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        taskId: params.taskId,
        subAgentId: params.subAgentId,
        type: params.type,
        status: params.status || 'pending',
        interactionData: params.interactionData,
        checkpoint: params.checkpoint,
        expiresAt: params.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const getPendingInteraction =
  (db: AgentsRunDatabaseClient) =>
  async (params: GetPendingInteractionParams): Promise<PendingInteractionSelect | null> => {
    const { tenantId, projectId, interactionId } = params;

    const result = await db
      .select()
      .from(pendingInteractions)
      .where(
        and(
          eq(pendingInteractions.tenantId, tenantId),
          eq(pendingInteractions.projectId, projectId),
          eq(pendingInteractions.id, interactionId)
        )
      )
      .limit(1);

    return result[0] || null;
  };

export const getPendingInteractionsByConversation =
  (db: AgentsRunDatabaseClient) =>
  async (
    params: GetPendingInteractionsByConversationParams
  ): Promise<PendingInteractionSelect[]> => {
    const { tenantId, projectId, conversationId, status } = params;

    const conditions = [
      eq(pendingInteractions.tenantId, tenantId),
      eq(pendingInteractions.projectId, projectId),
      eq(pendingInteractions.conversationId, conversationId),
    ];

    if (status) {
      conditions.push(eq(pendingInteractions.status, status));
    }

    return await db
      .select()
      .from(pendingInteractions)
      .where(and(...conditions));
  };

export const updatePendingInteraction =
  (db: AgentsRunDatabaseClient) =>
  async (params: UpdatePendingInteractionParams): Promise<PendingInteractionSelect | null> => {
    const { tenantId, projectId, interactionId, data } = params;
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.response !== undefined) {
      updateData.response = data.response;
    }
    if (data.respondedAt !== undefined) {
      updateData.respondedAt = data.respondedAt;
    }

    const [updated] = await db
      .update(pendingInteractions)
      .set(updateData)
      .where(
        and(
          eq(pendingInteractions.tenantId, tenantId),
          eq(pendingInteractions.projectId, projectId),
          eq(pendingInteractions.id, interactionId)
        )
      )
      .returning();

    return updated || null;
  };

export const respondToInteraction =
  (db: AgentsRunDatabaseClient) =>
  async (params: RespondToInteractionParams): Promise<PendingInteractionSelect | null> => {
    const { tenantId, projectId, interactionId, response, status } = params;
    const now = new Date().toISOString();

    const [updated] = await db
      .update(pendingInteractions)
      .set({
        status,
        response,
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(pendingInteractions.tenantId, tenantId),
          eq(pendingInteractions.projectId, projectId),
          eq(pendingInteractions.id, interactionId),
          eq(pendingInteractions.status, 'pending')
        )
      )
      .returning();

    return updated || null;
  };

export const expirePendingInteractions =
  (db: AgentsRunDatabaseClient) => async (): Promise<number> => {
    const now = new Date().toISOString();

    const result = await db
      .update(pendingInteractions)
      .set({
        status: 'expired' as const,
        updatedAt: now,
      })
      .where(and(eq(pendingInteractions.status, 'pending'), lt(pendingInteractions.expiresAt, now)))
      .returning();

    return result.length;
  };

export const deletePendingInteraction =
  (db: AgentsRunDatabaseClient) =>
  async (params: GetPendingInteractionParams): Promise<boolean> => {
    const { tenantId, projectId, interactionId } = params;

    const result = await db
      .delete(pendingInteractions)
      .where(
        and(
          eq(pendingInteractions.tenantId, tenantId),
          eq(pendingInteractions.projectId, projectId),
          eq(pendingInteractions.id, interactionId)
        )
      )
      .returning();

    return result.length > 0;
  };
