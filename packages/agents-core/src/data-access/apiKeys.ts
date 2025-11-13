import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { apiKeys } from '../db/schema';
import type { ApiKeyInsert, ApiKeySelect, ApiKeyUpdate } from '../types/entities';
import type {
  ApiKeyCreateResult,
  CreateApiKeyParams,
  PaginationConfig,
  ProjectScopeConfig,
} from '../types/utility';
import { extractPublicId, generateApiKey, isApiKeyExpired, validateApiKey } from '../utils/apiKeys';

export const getApiKeyById =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; id: string }) => {
    return await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.tenantId, params.scopes.tenantId),
        eq(apiKeys.projectId, params.scopes.projectId),
        eq(apiKeys.id, params.id)
      ),
    });
  };

export const getApiKeyByPublicId = (db: DatabaseClient) => async (publicId: string) => {
  return await db.query.apiKeys.findFirst({
    where: eq(apiKeys.publicId, publicId),
  });
};

export const listApiKeys =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; agentId?: string }) => {
    const conditions = [
      eq(apiKeys.tenantId, params.scopes.tenantId),
      eq(apiKeys.projectId, params.scopes.projectId),
    ];

    if (params.agentId) {
      conditions.push(eq(apiKeys.agentId, params.agentId));
    }

    return await db.query.apiKeys.findMany({
      where: and(...conditions),
      orderBy: [desc(apiKeys.createdAt)],
    });
  };

export const listApiKeysPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    pagination?: PaginationConfig;
    agentId?: string;
  }): Promise<{
    data: ApiKeySelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(apiKeys.tenantId, params.scopes.tenantId),
      eq(apiKeys.projectId, params.scopes.projectId),
    ];
    if (params.agentId) {
      conditions.push(eq(apiKeys.agentId, params.agentId));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(apiKeys)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(apiKeys.createdAt)),
      db.select({ count: count() }).from(apiKeys).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
    const pages = Math.ceil(totalNumber / limit);

    return {
      data,
      pagination: { page, limit, total: totalNumber, pages },
    };
  };

export const createApiKey = (db: DatabaseClient) => async (params: ApiKeyInsert) => {
  const now = new Date().toISOString();

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      id: params.id,
      name: params.name,
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
      publicId: params.publicId,
      keyHash: params.keyHash,
      keyPrefix: params.keyPrefix,
      expiresAt: params.expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return apiKey;
};

export const updateApiKey =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string; data: ApiKeyUpdate }) => {
    const now = new Date().toISOString();

    const [updatedKey] = await db
      .update(apiKeys)
      .set({
        name: params.data.name,
        expiresAt: params.data.expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(apiKeys.tenantId, params.scopes.tenantId),
          eq(apiKeys.projectId, params.scopes.projectId),
          eq(apiKeys.id, params.id)
        )
      )
      .returning();

    return updatedKey;
  };

export const deleteApiKey =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    try {
      const existingKey = await getApiKeyById(db)({
        scopes: params.scopes,
        id: params.id,
      });

      if (!existingKey) {
        console.error('API key not found', { params });
        return false;
      }

      await db
        .delete(apiKeys)
        .where(
          and(
            eq(apiKeys.tenantId, params.scopes.tenantId),
            eq(apiKeys.projectId, params.scopes.projectId),
            eq(apiKeys.id, params.id)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      return false;
    }
  };

export const hasApiKey =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    const apiKey = await getApiKeyById(db)(params);
    return apiKey !== null;
  };

export const updateApiKeyLastUsed =
  (db: DatabaseClient) =>
  async (id: string): Promise<void> => {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, id));
  };

export const countApiKeys =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; agentId?: string }): Promise<number> => {
    const conditions = [
      eq(apiKeys.tenantId, params.scopes.tenantId),
      eq(apiKeys.projectId, params.scopes.projectId),
    ];

    if (params.agentId) {
      conditions.push(eq(apiKeys.agentId, params.agentId));
    }

    const result = await db
      .select({ count: count() })
      .from(apiKeys)
      .where(and(...conditions));

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Create a new API key
 * Returns both the API key record and the full key (which should be shown to the user only once)
 */
export const generateAndCreateApiKey = async (
  params: CreateApiKeyParams,
  db: DatabaseClient
): Promise<ApiKeyCreateResult> => {
  const { tenantId, projectId, agentId, expiresAt, name } = params;

  // Generate the API key
  const keyData = await generateApiKey();

  // Store the API key in the database
  const apiKey = await createApiKey(db)({
    tenantId,
    projectId,
    agentId,
    name,
    expiresAt,
    ...keyData,
  });

  return {
    apiKey,
    key: keyData.key, // Return the full key to show to the user once
  };
};

/**
 * Validate an API key and return the associated record if valid
 */
export const validateAndGetApiKey = async (
  key: string,
  db: DatabaseClient
): Promise<ApiKeySelect | null> => {
  // Extract publicId from the key for O(1) lookup
  const publicId = extractPublicId(key);
  if (!publicId) {
    return null;
  }

  // Direct lookup using publicId (O(1) with unique index)
  const apiKey = await getApiKeyByPublicId(db)(publicId);

  if (!apiKey) {
    return null;
  }

  const isValid = await validateApiKey(key, apiKey.keyHash);
  if (!isValid) {
    return null;
  }

  if (isApiKeyExpired(apiKey.expiresAt)) {
    return null;
  }

  await updateApiKey(db)({
    scopes: { tenantId: apiKey.tenantId, projectId: apiKey.projectId },
    id: apiKey.id,
    data: { lastUsedAt: new Date().toISOString() },
  });

  return apiKey;
};
