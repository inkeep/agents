import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { triggers } from '../../db/manage/manage-schema';
import type { TriggerInsert, TriggerSelect, TriggerUpdate } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import type { SignatureVerificationConfig } from '../../validation/schemas';

/**
 * Drizzle-native types inferred directly from the schema.
 * These bridge the gap between Zod types (which use `| undefined`) and
 * Drizzle's expected types (which use `| null`).
 */
type DrizzleTriggerInsert = typeof triggers.$inferInsert;
type DrizzleTriggerSelect = typeof triggers.$inferSelect;

/**
 * Converts a Zod-based TriggerInsert to Drizzle-compatible insert values.
 * Maps `undefined` values to `null` where Drizzle expects nullable fields.
 */
function toTriggerInsertValues(data: TriggerInsert): DrizzleTriggerInsert {
  return {
    tenantId: data.tenantId,
    projectId: data.projectId,
    agentId: data.agentId,
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    enabled: data.enabled ?? true,
    inputSchema: data.inputSchema ?? null,
    outputTransform: data.outputTransform ?? null,
    messageTemplate: data.messageTemplate ?? null,
    authentication: data.authentication ?? null,
    signingSecretCredentialReferenceId: data.signingSecretCredentialReferenceId ?? null,
    signatureVerification: (data.signatureVerification ?? null) as SignatureVerificationConfig | null,
  };
}

/**
 * Converts a Zod-based TriggerUpdate to Drizzle-compatible update values.
 * Only includes fields that are explicitly set (not undefined).
 */
function toTriggerUpdateValues(
  data: TriggerUpdate,
  includeTimestamp = true
): Partial<DrizzleTriggerInsert> {
  const result: Partial<DrizzleTriggerInsert> = {};

  if (includeTimestamp) {
    result.updatedAt = new Date().toISOString();
  }

  if (data.name !== undefined) result.name = data.name;
  if (data.description !== undefined) result.description = data.description ?? null;
  if (data.enabled !== undefined) result.enabled = data.enabled;
  if (data.inputSchema !== undefined) result.inputSchema = data.inputSchema ?? null;
  if (data.outputTransform !== undefined) result.outputTransform = data.outputTransform ?? null;
  if (data.messageTemplate !== undefined) result.messageTemplate = data.messageTemplate ?? null;
  if (data.authentication !== undefined) result.authentication = data.authentication ?? null;
  if (data.signingSecretCredentialReferenceId !== undefined) {
    result.signingSecretCredentialReferenceId = data.signingSecretCredentialReferenceId ?? null;
  }
  if (data.signatureVerification !== undefined) {
    result.signatureVerification = (data.signatureVerification ??
      null) as SignatureVerificationConfig | null;
  }

  return result;
}

/**
 * Converts a Drizzle select result to the Zod-compatible TriggerSelect type.
 */
function toTriggerSelect(row: DrizzleTriggerSelect): TriggerSelect {
  return row as TriggerSelect;
}

/**
 * Get a trigger by ID (agent-scoped)
 */
export const getTriggerById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
  }): Promise<TriggerSelect | undefined> => {
    const { scopes, triggerId } = params;

    const result = await db.query.triggers.findFirst({
      where: and(
        eq(triggers.tenantId, scopes.tenantId),
        eq(triggers.projectId, scopes.projectId),
        eq(triggers.agentId, scopes.agentId),
        eq(triggers.id, triggerId)
      ),
    });

    return result ? toTriggerSelect(result) : undefined;
  };

/**
 * List all triggers for an agent
 */
export const listTriggers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<TriggerSelect[]> => {
    const result = await db.query.triggers.findMany({
      where: and(
        eq(triggers.tenantId, params.scopes.tenantId),
        eq(triggers.projectId, params.scopes.projectId),
        eq(triggers.agentId, params.scopes.agentId)
      ),
    });
    return result.map(toTriggerSelect);
  };

/**
 * List triggers for an agent with pagination
 */
export const listTriggersPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(triggers.tenantId, params.scopes.tenantId),
      eq(triggers.projectId, params.scopes.projectId),
      eq(triggers.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(triggers)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(triggers.createdAt)),
      db.select({ count: count() }).from(triggers).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new trigger (agent-scoped)
 */
export const createTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: TriggerInsert): Promise<TriggerSelect> => {
    const insertValues = toTriggerInsertValues(params);
    const result = await db.insert(triggers).values(insertValues).returning();
    return toTriggerSelect(result[0]);
  };

/**
 * Update a trigger (agent-scoped)
 */
export const updateTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    data: TriggerUpdate;
  }): Promise<TriggerSelect> => {
    const updateValues = toTriggerUpdateValues(params.data);

    const result = await db
      .update(triggers)
      .set(updateValues)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      )
      .returning();

    return toTriggerSelect(result[0]);
  };

/**
 * Delete a trigger (agent-scoped)
 */
export const deleteTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string }): Promise<void> => {
    await db
      .delete(triggers)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      );
  };

/**
 * Upsert a trigger (create or update based on existence)
 */
export const upsertTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; data: TriggerInsert }): Promise<TriggerSelect> => {
    const { scopes, data } = params;

    // Check if trigger exists
    const existing = await db.query.triggers.findFirst({
      where: and(
        eq(triggers.tenantId, scopes.tenantId),
        eq(triggers.projectId, scopes.projectId),
        eq(triggers.agentId, scopes.agentId),
        eq(triggers.id, data.id)
      ),
    });

    if (existing) {
      // Update existing trigger - convert TriggerInsert fields to update values
      const updateValues: Partial<DrizzleTriggerInsert> = {
        name: data.name,
        description: data.description ?? null,
        enabled: data.enabled ?? true,
        inputSchema: data.inputSchema ?? null,
        outputTransform: data.outputTransform ?? null,
        messageTemplate: data.messageTemplate ?? null,
        authentication: data.authentication ?? null,
        signingSecretCredentialReferenceId: data.signingSecretCredentialReferenceId ?? null,
        signatureVerification: (data.signatureVerification ?? null) as SignatureVerificationConfig | null,
        updatedAt: new Date().toISOString(),
      };

      const result = await db
        .update(triggers)
        .set(updateValues)
        .where(
          and(
            eq(triggers.tenantId, scopes.tenantId),
            eq(triggers.projectId, scopes.projectId),
            eq(triggers.agentId, scopes.agentId),
            eq(triggers.id, data.id)
          )
        )
        .returning();
      return toTriggerSelect(result[0]);
    }

    // Create new trigger
    const insertValues = toTriggerInsertValues({
      ...data,
      tenantId: scopes.tenantId,
      projectId: scopes.projectId,
      agentId: scopes.agentId,
    });
    const result = await db.insert(triggers).values(insertValues).returning();
    return toTriggerSelect(result[0]);
  };
