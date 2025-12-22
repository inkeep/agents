import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { projectMetadata } from '../../db/runtime/runtime-schema';
import type { PaginationConfig } from '../../types/utility';
import type { ProjectMetadataInsert, ProjectMetadataSelect } from '../../types/entities';

export interface ProjectMetadataPaginatedResult {
  data: ProjectMetadataSelect[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Get a project from the runtime DB by ID
 */
export const getProjectMetadata =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectMetadataSelect | null> => {
    const result = await db.query.projectMetadata.findFirst({
      where: and(
        eq(projectMetadata.tenantId, params.tenantId),
        eq(projectMetadata.id, params.projectId)
      ),
    });
    return result ?? null;
  };

/**
 * List all runtimeProjects for a tenant from the runtime DB
 */
export const listProjectsMetadata =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string }): Promise<ProjectMetadataSelect[]> => {
    return await db.query.projectMetadata.findMany({
      where: eq(projectMetadata.tenantId, params.tenantId),
      orderBy: [desc(projectMetadata.createdAt)],
    });
  };

/**
 * List runtimeProjects with pagination from the runtime DB
 */
export const listProjectsMetadataPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    pagination?: PaginationConfig;
  }): Promise<ProjectMetadataPaginatedResult> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = eq(projectMetadata.tenantId, params.tenantId);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(projectMetadata)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(projectMetadata.createdAt)),
      db.select({ count: count() }).from(projectMetadata).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
    const pages = Math.ceil(totalNumber / limit);

    return {
      data,
      pagination: { page, limit, total: totalNumber, pages },
    };
  };

/**
 * Create a project in the runtime DB
 */
export const createProjectMetadata =
  (db: AgentsRunDatabaseClient) =>
  async (params: ProjectMetadataInsert): Promise<ProjectMetadataSelect> => {
    const now = new Date().toISOString();

    const [project] = await db
      .insert(projectMetadata)
      .values({
        id: params.id,
        tenantId: params.tenantId,
        createdBy: params.createdBy ?? null,
        mainBranchName: params.mainBranchName,
        createdAt: now,
      })
      .returning();

    return project;
  };

/**
 * Delete a project from the runtime DB
 */
export const deleteProjectMetadata =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string }): Promise<boolean> => {
    const result = await db
      .delete(projectMetadata)
      .where(
        and(eq(projectMetadata.tenantId, params.tenantId), eq(projectMetadata.id, params.projectId))
      )
      .returning();

    return result.length > 0;
  };

/**
 * Check if a project exists in the runtime DB
 */
export const projectsMetadataExists =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string }): Promise<boolean> => {
    const project = await getProjectMetadata(db)(params);
    return project !== null;
  };

/**
 * Count runtimeProjects for a tenant
 */
export const countProjectsInRuntime =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(projectMetadata)
      .where(eq(projectMetadata.tenantId, params.tenantId));

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };
