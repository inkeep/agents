import { and, count, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { ledgerArtifacts } from '../db/schema';
import type { Artifact, LedgerArtifactSelect, Part, ProjectScopeConfig } from '../types/index';

/**
 * Save one or more artifacts to the ledger
 */
export const addLedgerArtifacts =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextId: string;
    taskId?: string | null;
    toolCallId?: string | null;
    artifacts: Artifact[];
  }): Promise<void> => {
    const { scopes, contextId, taskId = null, toolCallId = null, artifacts } = params;
    if (artifacts.length === 0) return;

    const now = new Date().toISOString();
    const rows = artifacts.map((art) => {
      // Resolve taskId precedence: explicit param -> artifact.taskId -> metadata.taskId
      const resolvedTaskId = taskId ?? art.taskId ?? (art.metadata as any)?.taskId ?? null;

      return {
        id: art.artifactId ?? nanoid(),
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        taskId: resolvedTaskId,
        toolCallId: toolCallId ?? (art.metadata as any)?.toolCallId ?? null,
        contextId,
        name: art.name ?? null,
        description: art.description ?? null,
        parts: art.parts ?? null,
        metadata: art.metadata ?? null,

        // extra (optional) ledger fields
        summary: art.description?.slice(0, 200) ?? null,
        mime: art.parts?.map((p) => p.kind) ?? null,
        visibility: (art.metadata as any)?.visibility ?? 'context',
        allowedAgents: (art.metadata as any)?.allowedAgents ?? null,
        derivedFrom: (art.metadata as any)?.derivedFrom ?? null,

        createdAt: now,
        updatedAt: now,
      };
    });

    await db.insert(ledgerArtifacts).values(rows);
  };

/**
 * Retrieve artifacts by taskId, toolCallId, and/or artifactId.
 * At least one of taskId, toolCallId, or artifactId must be provided.
 */
export const getLedgerArtifacts =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    taskId?: string;
    toolCallId?: string;
    artifactId?: string;
  }): Promise<Artifact[]> => {
    const { scopes, taskId, toolCallId, artifactId } = params;

    if (!taskId && !toolCallId && !artifactId) {
      throw new Error('At least one of taskId, toolCallId, or artifactId must be provided');
    }

    const conditions = [
      eq(ledgerArtifacts.tenantId, scopes.tenantId),
      eq(ledgerArtifacts.projectId, scopes.projectId),
    ];

    if (artifactId) {
      conditions.push(eq(ledgerArtifacts.id, artifactId));
    }

    if (taskId) {
      conditions.push(eq(ledgerArtifacts.taskId, taskId));
    }

    if (toolCallId) {
      conditions.push(eq(ledgerArtifacts.toolCallId, toolCallId));
    }

    const query = db
      .select()
      .from(ledgerArtifacts)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    const results = await query;

    // Convert the database rows back to Artifact type using structured fields
    return results.map(
      (row): Artifact => ({
        artifactId: row.id,
        type: row.type ?? 'source',
        taskId: row.taskId ?? undefined,
        toolCallId: row.toolCallId ?? undefined, // Added for traceability to the specific tool execution
        name: row.name ?? undefined,
        description: row.description ?? undefined,
        parts: (row.parts ?? []) as Part[], // row.parts may be null in DB
        metadata: row.metadata || {},
      })
    );
  };

/**
 * Get ledger artifacts by context ID
 */
export const getLedgerArtifactsByContext =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextId: string;
  }): Promise<LedgerArtifactSelect[]> => {
    return await db
      .select()
      .from(ledgerArtifacts)
      .where(
        and(
          eq(ledgerArtifacts.tenantId, params.scopes.tenantId),
          eq(ledgerArtifacts.projectId, params.scopes.projectId),
          eq(ledgerArtifacts.contextId, params.contextId)
        )
      );
  };

/**
 * Delete ledger artifacts by task ID
 */
export const deleteLedgerArtifactsByTask =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; taskId: string }): Promise<boolean> => {
    const result = await db
      .delete(ledgerArtifacts)
      .where(
        and(
          eq(ledgerArtifacts.tenantId, params.scopes.tenantId),
          eq(ledgerArtifacts.projectId, params.scopes.projectId),
          eq(ledgerArtifacts.taskId, params.taskId)
        )
      )
      .returning();

    return result.length > 0;
  };

/**
 * Delete ledger artifacts by context ID
 */
export const deleteLedgerArtifactsByContext =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; contextId: string }): Promise<boolean> => {
    const result = await db
      .delete(ledgerArtifacts)
      .where(
        and(
          eq(ledgerArtifacts.tenantId, params.scopes.tenantId),
          eq(ledgerArtifacts.projectId, params.scopes.projectId),
          eq(ledgerArtifacts.contextId, params.contextId)
        )
      )
      .returning();

    return result.length > 0;
  };

/**
 * Count ledger artifacts by task ID
 */
export const countLedgerArtifactsByTask =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; taskId: string }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(ledgerArtifacts)
      .where(
        and(
          eq(ledgerArtifacts.tenantId, params.scopes.tenantId),
          eq(ledgerArtifacts.projectId, params.scopes.projectId),
          eq(ledgerArtifacts.taskId, params.taskId)
        )
      );

    const countValue = result[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : countValue || 0;
  };
