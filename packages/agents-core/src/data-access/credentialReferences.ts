import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { credentialReferences, tools } from '../db/schema';
import type {
  CredentialReferenceInsert,
  CredentialReferenceSelect,
  CredentialReferenceUpdate,
  PaginationConfig,
  ProjectScopeConfig,
  ToolSelect,
} from '../types/index';

export type CredentialReferenceWithTools = CredentialReferenceSelect & { tools: ToolSelect[] };

/**
 * Get a credential reference by ID
 */
export const getCredentialReference =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
  }): Promise<CredentialReferenceSelect | undefined> => {
    return await db.query.credentialReferences.findFirst({
      where: and(
        eq(credentialReferences.tenantId, params.scopes.tenantId),
        eq(credentialReferences.projectId, params.scopes.projectId),
        eq(credentialReferences.id, params.id)
      ),
    });
  };

/**
 * Get a credential reference by ID with its related tools
 */
export const getCredentialReferenceWithTools =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
  }): Promise<CredentialReferenceWithTools | undefined> => {
    const [credential, relatedTools] = await Promise.all([
      db.query.credentialReferences.findFirst({
        where: and(
          eq(credentialReferences.tenantId, params.scopes.tenantId),
          eq(credentialReferences.projectId, params.scopes.projectId),
          eq(credentialReferences.id, params.id)
        ),
      }),
      db
        .select()
        .from(tools)
        .where(
          and(
            eq(tools.tenantId, params.scopes.tenantId),
            eq(tools.projectId, params.scopes.projectId),
            eq(tools.credentialReferenceId, params.id)
          )
        ),
    ]);

    if (!credential) {
      return undefined;
    }

    return {
      ...credential,
      tools: relatedTools,
    };
  };

/**
 * List all credential references for a tenant/project
 */
export const listCredentialReferences =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<CredentialReferenceSelect[]> => {
    return await db.query.credentialReferences.findMany({
      where: and(
        eq(credentialReferences.tenantId, params.scopes.tenantId),
        eq(credentialReferences.projectId, params.scopes.projectId)
      ),
      orderBy: [desc(credentialReferences.createdAt)],
    });
  };

/**
 * List credential references with pagination
 */
export const listCredentialReferencesPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
    data: CredentialReferenceSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(credentialReferences.tenantId, params.scopes.tenantId),
      eq(credentialReferences.projectId, params.scopes.projectId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(credentialReferences)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(credentialReferences.createdAt)),
      db.select({ count: sql`COUNT(*)` }).from(credentialReferences).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.count || 0);
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new credential reference
 */
export const createCredentialReference =
  (db: DatabaseClient) =>
  async (params: CredentialReferenceInsert): Promise<CredentialReferenceSelect> => {
    const now = new Date().toISOString();

    const [credentialReference] = await db
      .insert(credentialReferences)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return credentialReference;
  };

/**
 * Update a credential reference
 */
export const updateCredentialReference =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
    data: Partial<CredentialReferenceUpdate>;
  }): Promise<CredentialReferenceWithTools | undefined> => {
    const now = new Date().toISOString();

    await db
      .update(credentialReferences)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(credentialReferences.tenantId, params.scopes.tenantId),
          eq(credentialReferences.projectId, params.scopes.projectId),
          eq(credentialReferences.id, params.id)
        )
      );

    return await getCredentialReferenceWithTools(db)({
      scopes: params.scopes,
      id: params.id,
    });
  };

/**
 * Delete a credential reference
 */
export const deleteCredentialReference =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    // First check if the credential reference exists
    const existingCredential = await getCredentialReference(db)({
      scopes: params.scopes,
      id: params.id,
    });

    if (!existingCredential) {
      return false;
    }

    // Delete the credential reference
    await db
      .delete(credentialReferences)
      .where(
        and(
          eq(credentialReferences.tenantId, params.scopes.tenantId),
          eq(credentialReferences.projectId, params.scopes.projectId),
          eq(credentialReferences.id, params.id)
        )
      );

    // Verify deletion was successful
    const deletedCredential = await getCredentialReference(db)({
      scopes: params.scopes,
      id: params.id,
    });

    return deletedCredential === undefined;
  };

/**
 * Check if a credential reference exists
 */
export const hasCredentialReference =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    const credential = await getCredentialReference(db)(params);
    return credential !== null;
  };

/**
 * Get credential reference by ID (simple version without tools)
 */
export const getCredentialReferenceById =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
  }): Promise<CredentialReferenceSelect | null> => {
    const result = await db.query.credentialReferences.findFirst({
      where: and(
        eq(credentialReferences.tenantId, params.scopes.tenantId),
        eq(credentialReferences.projectId, params.scopes.projectId),
        eq(credentialReferences.id, params.id)
      ),
    });

    return result || null;
  };

/**
 * Count credential references for a tenant/project
 */
export const countCredentialReferences =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(credentialReferences)
      .where(
        and(
          eq(credentialReferences.tenantId, params.scopes.tenantId),
          eq(credentialReferences.projectId, params.scopes.projectId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Upsert a credential reference (create if it doesn't exist, update if it does)
 */
export const upsertCredentialReference =
  (db: DatabaseClient) =>
  async (params: { data: CredentialReferenceInsert }): Promise<CredentialReferenceSelect> => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

    const existing = await getCredentialReference(db)({
      scopes,
      id: params.data.id,
    });

    if (existing) {
      // Update existing credential reference
      const updated = await updateCredentialReference(db)({
        scopes,
        id: params.data.id,
        data: {
          type: params.data.type,
          credentialStoreId: params.data.credentialStoreId,
          retrievalParams: params.data.retrievalParams,
        },
      });
      if (!updated) {
        throw new Error('Failed to update credential reference - no rows affected');
      }
      return updated;
    } else {
      // Create new credential reference
      return await createCredentialReference(db)(params.data);
    }
  };
