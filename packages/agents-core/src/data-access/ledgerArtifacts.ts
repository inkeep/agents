import { and, count, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { ledgerArtifacts } from '../db/schema';
import type { Artifact, LedgerArtifactSelect, Part, ProjectScopeConfig } from '../types/index';
import { generateId } from '../utils/conversations';

/**
 * Validate artifact data before database insertion
 */
function validateArtifactData(artifact: Artifact, index: number): void {
  if (!artifact.artifactId?.trim()) {
    throw new Error(`Artifact at index ${index} missing required artifactId`);
  }

  if (artifact.parts) {
    try {
      JSON.stringify(artifact.parts);
    } catch (error) {
      throw new Error(
        `Artifact ${artifact.artifactId} has invalid parts data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  if (artifact.metadata) {
    try {
      JSON.stringify(artifact.metadata);
    } catch (error) {
      throw new Error(
        `Artifact ${artifact.artifactId} has invalid metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Determine appropriate MIME types based on artifact parts
 * Uses the 'kind' values from parts to determine content types (A2A principle)
 */
function determineMimeTypes(artifact: Artifact): string[] {
  if (artifact.parts && artifact.parts.length > 0) {
    const kinds = new Set<string>();

    for (const part of artifact.parts) {
      if (part.kind) {
        kinds.add(part.kind);
      }
    }

    if (kinds.size > 0) {
      return Array.from(kinds);
    }
  }

  if (artifact.type?.toLowerCase().includes('document')) {
    return ['text'];
  }

  if (artifact.type?.toLowerCase().includes('image')) {
    return ['image'];
  }

  if (artifact.type?.toLowerCase().includes('code')) {
    return ['text'];
  }

  return ['data'];
}

/**
 * Sanitize artifact data to ensure database compatibility
 */
function sanitizeArtifactForDatabase(artifact: Artifact): Artifact {
  return {
    ...artifact,
    name: artifact.name?.slice(0, 255) || undefined,
    description: artifact.description?.slice(0, 1000) || undefined,
    parts: artifact.parts ? JSON.parse(JSON.stringify(artifact.parts)) : null,
    metadata: artifact.metadata ? JSON.parse(JSON.stringify(artifact.metadata)) : null,
  };
}

/**
 * Fallback insert strategy for when normal insert fails
 */
async function tryFallbackInsert(
  db: DatabaseClient,
  rows: any[],
  _originalError: any
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await db.insert(ledgerArtifacts).values([row]);
    } catch (_fallbackError: any) {
      try {
        const minimalRow = {
          id: row.id,
          tenantId: row.tenantId,
          projectId: row.projectId,
          taskId: row.taskId,
          toolCallId: row.toolCallId,
          contextId: row.contextId,
          type: row.type || 'source',
          name: row.name || `Artifact ${row.id.substring(0, 8)}`,
          description: row.description || 'Artifact from tool results',
          parts: null, // Skip complex JSON data
          metadata: null, // Skip complex JSON data
          summary: null,
          mime: null,
          visibility: 'context',
          allowedAgents: null,
          derivedFrom: null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };

        await db.insert(ledgerArtifacts).values([minimalRow]);
      } catch (_finalError: any) {}
    }
  }
}

/**
 * Atomic upsert operation for a single artifact - prevents race conditions
 */
export const upsertLedgerArtifact =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextId: string;
    taskId: string;
    toolCallId?: string | null;
    artifact: Artifact;
  }): Promise<{ created: boolean; existing?: any }> => {
    const { scopes, contextId, taskId, toolCallId = null, artifact } = params;

    validateArtifactData(artifact, 0);

    const sanitizedArt = sanitizeArtifactForDatabase(artifact);
    const now = new Date().toISOString();

    const artifactRow = {
      id: sanitizedArt.artifactId ?? generateId(),
      tenantId: scopes.tenantId,
      projectId: scopes.projectId,
      taskId,
      toolCallId,
      contextId,
      type: sanitizedArt.type ?? 'source',
      name: sanitizedArt.name,
      description: sanitizedArt.description,
      parts: sanitizedArt.parts,
      metadata: sanitizedArt.metadata,
      summary: sanitizedArt.description?.slice(0, 200) ?? null,
      mime: determineMimeTypes(sanitizedArt),
      visibility: (sanitizedArt.metadata as any)?.visibility ?? 'context',
      allowedAgents: (sanitizedArt.metadata as any)?.allowedAgents ?? [],
      derivedFrom: (sanitizedArt.metadata as any)?.derivedFrom ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(ledgerArtifacts).values([artifactRow]);
      return { created: true };
    } catch (error: any) {
      if (error.message?.includes('UNIQUE') || error.message?.includes('duplicate')) {
        const existing = await db
          .select()
          .from(ledgerArtifacts)
          .where(
            and(
              eq(ledgerArtifacts.tenantId, scopes.tenantId),
              eq(ledgerArtifacts.projectId, scopes.projectId),
              eq(ledgerArtifacts.id, artifactRow.id),
              eq(ledgerArtifacts.taskId, taskId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          return { created: false, existing: existing[0] };
        }
      }
      throw error;
    }
  };

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

    for (let i = 0; i < artifacts.length; i++) {
      validateArtifactData(artifacts[i], i);
    }

    const now = new Date().toISOString();
    const rows = artifacts.map((art) => {
      const sanitizedArt = sanitizeArtifactForDatabase(art);

      const resolvedTaskId =
        taskId ?? sanitizedArt.taskId ?? (sanitizedArt.metadata as any)?.taskId ?? null;

      return {
        id: sanitizedArt.artifactId ?? generateId(),
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        taskId: resolvedTaskId,
        toolCallId: toolCallId ?? (sanitizedArt.metadata as any)?.toolCallId ?? null,
        contextId,
        type: sanitizedArt.type ?? 'source',
        name: sanitizedArt.name,
        description: sanitizedArt.description,
        parts: sanitizedArt.parts,
        metadata: sanitizedArt.metadata,

        summary: sanitizedArt.description?.slice(0, 200) ?? null,
        mime: determineMimeTypes(sanitizedArt), // Simple string fallback until we debug the issue
        visibility: (sanitizedArt.metadata as any)?.visibility ?? 'context',
        allowedAgents: (sanitizedArt.metadata as any)?.allowedAgents ?? [], // Fix: use empty array, not null
        derivedFrom: (sanitizedArt.metadata as any)?.derivedFrom ?? null,

        createdAt: now,
        updatedAt: now,
      };
    });

    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await db.insert(ledgerArtifacts).values(rows);

        return;
      } catch (error: any) {
        lastError = error;

        const isRetryable =
          error.cause.code === '40P01' ||
          error.cause.code === '40001' ||
          error.cause.code === '55P03' ||
          error.message?.includes('database is locked') ||
          error.message?.includes('busy') ||
          error.message?.includes('timeout') ||
          error.message?.includes('deadlock') ||
          error.message?.includes('serialization failure');

        if (!isRetryable || attempt === maxRetries) {
          await tryFallbackInsert(db, rows, error);
          return;
        }

        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
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
