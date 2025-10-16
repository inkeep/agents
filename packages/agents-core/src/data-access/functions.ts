import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { functions } from '../db/schema';
import type { FunctionApiInsert } from '../types/entities';
import type { ProjectScopeConfig } from '../types/utility';
import { autoDetectDependencies } from '../utils/detectDependencies';

/**
 * Create or update a function (project-scoped)
 */
export const upsertFunction =
  (db: DatabaseClient) =>
  async (params: { data: FunctionApiInsert; scopes: ProjectScopeConfig }): Promise<void> => {
    const { data, scopes } = params;
    const { tenantId, projectId } = scopes;

    // Auto-detect dependencies if not provided
    let dependencies = data.dependencies;
    if (!dependencies || Object.keys(dependencies).length === 0) {
      dependencies = autoDetectDependencies(data.executeCode);
    }

    const existingFunction = await db
      .select()
      .from(functions)
      .where(
        and(
          eq(functions.tenantId, tenantId),
          eq(functions.projectId, projectId),
          eq(functions.id, data.id)
        )
      )
      .limit(1);

    if (existingFunction.length > 0) {
      await db
        .update(functions)
        .set({
          inputSchema: data.inputSchema,
          executeCode: data.executeCode,
          dependencies: dependencies,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(functions.tenantId, tenantId),
            eq(functions.projectId, projectId),
            eq(functions.id, data.id)
          )
        );
    } else {
      await db.insert(functions).values({
        tenantId,
        projectId,
        id: data.id,
        inputSchema: data.inputSchema,
        executeCode: data.executeCode,
        dependencies: dependencies,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

/**
 * Get a function by ID (project-scoped)
 */
export const getFunction =
  (db: DatabaseClient) =>
  async (params: {
    functionId: string;
    scopes: ProjectScopeConfig;
  }): Promise<FunctionApiInsert | null> => {
    const { functionId, scopes } = params;
    const { tenantId, projectId } = scopes;

    const result = await db
      .select()
      .from(functions)
      .where(
        and(
          eq(functions.tenantId, tenantId),
          eq(functions.projectId, projectId),
          eq(functions.id, functionId)
        )
      )
      .limit(1);

    return result[0] || null;
  };

/**
 * List all functions for a project
 */
export const listFunctions =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<FunctionApiInsert[]> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    const result = await db
      .select()
      .from(functions)
      .where(and(eq(functions.tenantId, tenantId), eq(functions.projectId, projectId)));

    return result;
  };

/**
 * Delete a function (project-scoped)
 */
export const deleteFunction =
  (db: DatabaseClient) =>
  async (params: { functionId: string; scopes: ProjectScopeConfig }): Promise<void> => {
    const { functionId, scopes } = params;
    const { tenantId, projectId } = scopes;

    await db
      .delete(functions)
      .where(
        and(
          eq(functions.tenantId, tenantId),
          eq(functions.projectId, projectId),
          eq(functions.id, functionId)
        )
      );
  };
