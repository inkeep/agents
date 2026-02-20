import { and, count, eq, inArray } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { ledgerArtifacts } from '../../db/runtime/runtime-schema';
import { withRetry } from '../../retry';
import type { Artifact, LedgerArtifactSelect, Part, ProjectScopeConfig } from '../../types/index';
import { generateId } from '../../utils/conversations';

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
async function tryFallbackInsert(db: AgentsRunDatabaseClient, rows: any[]): Promise<void> {
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
  (db: AgentsRunDatabaseClient) =>
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

      // Create a cleaner error message without exposing massive artifact data
      const sanitizedError = new Error(
        `Failed to insert artifact ${artifactRow.id}: ${error.message?.split('\nparams:')[0] || error.message}`
      );
      sanitizedError.name = error.name;
      sanitizedError.cause = error.code || error.errno;

      // TEMPORARY DEBUG: Log full error for debugging compression artifacts
      if (artifactRow.id?.includes('compress_')) {
        console.error('COMPRESSION ARTIFACT FULL ERROR:', {
          artifactId: artifactRow.id,
          errorMessage: error.message,
          errorCode: error.code,
          errorName: error.name,
          errorStack: error.stack,
          fullError: error,
        });
      }

      throw sanitizedError;
    }
  };

/**
 * Save one or more artifacts to the ledger
 */
export const addLedgerArtifacts =
  (db: AgentsRunDatabaseClient) =>
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

    try {
      await withRetry(
        async () => {
          await db.insert(ledgerArtifacts).values(rows);
        },
        {
          context: 'addLedgerArtifacts',
        }
      );
    } catch {
      await tryFallbackInsert(db, rows);
    }
  };

/**
 * Retrieve artifacts by taskId, toolCallId, toolCallIds, and/or artifactId.
 * At least one of taskId, toolCallId, toolCallIds, or artifactId must be provided.
 * Use toolCallIds for batch queries to avoid N+1 query problems.
 */
export const getLedgerArtifacts =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    taskId?: string;
    toolCallId?: string;
    toolCallIds?: string[];
    artifactId?: string;
  }): Promise<Artifact[]> => {
    const { scopes, taskId, toolCallId, toolCallIds, artifactId } = params;

    if (!taskId && !toolCallId && !toolCallIds && !artifactId) {
      throw new Error(
        'At least one of taskId, toolCallId, toolCallIds, or artifactId must be provided'
      );
    }

    // Validate that both toolCallId and toolCallIds are not provided
    if (toolCallId && toolCallIds) {
      throw new Error(
        'Cannot provide both toolCallId and toolCallIds. Use toolCallIds for batch queries.'
      );
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

    if (toolCallIds && toolCallIds.length > 0) {
      conditions.push(inArray(ledgerArtifacts.toolCallId, toolCallIds));
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
        createdAt: row.createdAt, // Added for sorting artifacts by creation time
      })
    );
  };

/**
 * Get ledger artifacts by context ID
 */
export const getLedgerArtifactsByContext =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
