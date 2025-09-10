import type { DatabaseClient } from '../db/client.js';
import { projectExistsInTable } from './projects.js';

/**
 * Validates that a project exists before performing database operations
 * This provides runtime validation even when foreign key constraints are not enforced
 */
export const validateProjectExists = async (
  db: DatabaseClient,
  tenantId: string,
  projectId: string
): Promise<void> => {
  const exists = await projectExistsInTable(db)({
    scopes: { tenantId, projectId },
  });

  if (!exists) {
    throw new Error(
      `Project with ID "${projectId}" does not exist for tenant "${tenantId}". ` +
        `Please create the project first before adding resources to it.`
    );
  }
};

/**
 * Wraps a database operation with project validation
 * Ensures the project exists before executing the operation
 */
export const withProjectValidation = <T extends (...args: any[]) => Promise<any>>(
  db: DatabaseClient,
  operation: T
) => {
  return async (params: Parameters<T>[0]): Promise<ReturnType<T>> => {
    // Extract tenantId and projectId from params
    const tenantId = params.tenantId || params.scopes?.tenantId;
    const projectId = params.projectId || params.scopes?.projectId;

    if (tenantId && projectId) {
      await validateProjectExists(db, tenantId, projectId);
    }

    return operation(params);
  };
};

/**
 * Creates a validated version of data access functions
 * Automatically adds project validation to insert/update operations
 */
export const createValidatedDataAccess = <T extends Record<string, any>>(
  db: DatabaseClient,
  dataAccessFunctions: T
): T => {
  const validated = {} as T;

  for (const [key, fn] of Object.entries(dataAccessFunctions)) {
    if (typeof fn === 'function') {
      // Add validation to create/insert/update operations
      if (key.startsWith('create') || key.startsWith('insert') || key.startsWith('update')) {
        validated[key as keyof T] = withProjectValidation(db, fn) as T[keyof T];
      } else {
        validated[key as keyof T] = fn;
      }
    } else {
      validated[key as keyof T] = fn;
    }
  }

  return validated;
};
