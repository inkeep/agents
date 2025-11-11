import type { DatabaseClient } from '../db/client';
import { sql } from 'drizzle-orm';
import type { ResolvedRef } from './ref';
import { checkoutRef, getCurrentBranchOrCommit } from './ref';

export type SchemaVersion = {
  version: number;
  description: string;
  appliedAt: Date;
};

export type SchemaCompatibilityCheck = {
  isCompatible: boolean;
  currentVersion?: number;
  requiredVersion?: number;
  errorMessage?: string;
};

export const MAIN_BRANCH = 'main';
export const MIN_VIABLE_SCHEMA_VERSION_KEY = 'min_viable_schema_version';

const getAppliedMigrations = (db: DatabaseClient) => async (): Promise<SchemaVersion[]> => {
  try {
    const result = await db.execute(
      sql`SELECT * FROM __drizzle_migrations ORDER BY created_at ASC`
    );
    return result.rows.map((row: any, index) => ({
      version: index + 1,
      description: row.hash,
      appliedAt: new Date(row.created_at),
    }));
  } catch (error) {
    return [];
  }
};

export const getCurrentSchemaVersion = (db: DatabaseClient) => async (): Promise<number> => {
  const migrations = await getAppliedMigrations(db)();
  return migrations.length;
};

export const getMinViableSchemaVersion = (db: DatabaseClient) => async (): Promise<number> => {
  try {
    const result = await db.execute(
      sql`SELECT value FROM dolt_config WHERE name = ${MIN_VIABLE_SCHEMA_VERSION_KEY}`
    );
    const value = result.rows[0]?.value;
    return value ? Number.parseInt(value as string, 10) : 0;
  } catch (error) {
    return 0;
  }
};

export const setMinViableSchemaVersion =
  (db: DatabaseClient) =>
  async (version: number): Promise<void> => {
    await db.execute(
      sql`INSERT INTO dolt_config (name, value) VALUES (${MIN_VIABLE_SCHEMA_VERSION_KEY}, ${version.toString()}) ON CONFLICT (name) DO UPDATE SET value = ${version.toString()}`
    );
  };

export const checkSchemaCompatibility =
  (db: DatabaseClient) =>
  async (resolvedRef: ResolvedRef): Promise<SchemaCompatibilityCheck> => {
    const currentState = await getCurrentBranchOrCommit(db)();

    try {
      await checkoutRef(db)(resolvedRef);

      const refSchemaVersion = await getCurrentSchemaVersion(db)();

      await checkoutRef(db)({
        type: currentState.type,
        name: currentState.ref,
        hash: currentState.hash,
      });

      const mainSchemaVersion = await getCurrentSchemaVersion(db)();

      const minViableVersion = await getMinViableSchemaVersion(db)();

      if (refSchemaVersion < minViableVersion) {
        return {
          isCompatible: false,
          currentVersion: refSchemaVersion,
          requiredVersion: minViableVersion,
          errorMessage: `Schema version ${refSchemaVersion} is below minimum viable version ${minViableVersion}`,
        };
      }

      return {
        isCompatible: true,
        currentVersion: refSchemaVersion,
        requiredVersion: minViableVersion,
      };
    } catch (error) {
      await checkoutRef(db)({
        type: currentState.type,
        name: currentState.ref,
        hash: currentState.hash,
      });

      return {
        isCompatible: false,
        errorMessage: `Failed to check schema compatibility: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  };

export const getSchemaVersionForRef =
  (db: DatabaseClient) =>
  async (resolvedRef: ResolvedRef): Promise<number> => {
    const currentState = await getCurrentBranchOrCommit(db)();

    try {
      await checkoutRef(db)(resolvedRef);
      const version = await getCurrentSchemaVersion(db)();
      await checkoutRef(db)({
        type: currentState.type,
        name: currentState.ref,
        hash: currentState.hash,
      });
      return version;
    } catch (error) {
      await checkoutRef(db)({
        type: currentState.type,
        name: currentState.ref,
        hash: currentState.hash,
      });
      throw error;
    }
  };
