import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { functions } from '../db/schema';
import type { FunctionApiInsert } from '../types/entities';

/**
 * Create or update a function (global entity - not tenant/project scoped)
 */
export const upsertFunction =
  (db: DatabaseClient) =>
  async (params: { data: FunctionApiInsert }): Promise<void> => {
    const { data } = params;

    // Check if function exists
    const existingFunction = await db
      .select()
      .from(functions)
      .where(eq(functions.id, data.id))
      .limit(1);

    if (existingFunction.length > 0) {
      // Update existing function
      await db
        .update(functions)
        .set({
          inputSchema: data.inputSchema,
          executeCode: data.executeCode,
          dependencies: data.dependencies,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(functions.id, data.id));
    } else {
      // Create new function
      await db.insert(functions).values({
        id: data.id,
        inputSchema: data.inputSchema,
        executeCode: data.executeCode,
        dependencies: data.dependencies,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

/**
 * Get a function by ID (global entity)
 */
export const getFunction =
  (db: DatabaseClient) =>
  async (params: { functionId: string }): Promise<FunctionApiInsert | null> => {
    const { functionId } = params;

    const result = await db.select().from(functions).where(eq(functions.id, functionId)).limit(1);

    return result[0] || null;
  };

/**
 * List all functions (global entity)
 */
export const listFunctions = (db: DatabaseClient) => async (): Promise<FunctionApiInsert[]> => {
  const result = await db.select().from(functions);

  return result;
};

/**
 * Delete a function (global entity)
 */
export const deleteFunction =
  (db: DatabaseClient) =>
  async (params: { functionId: string }): Promise<void> => {
    const { functionId } = params;

    await db.delete(functions).where(eq(functions.id, functionId));
  };
