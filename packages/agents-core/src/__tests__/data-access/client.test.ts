import { afterEach, describe, expect, it } from 'vitest';
import { createAgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { createTestManageDatabaseClient } from '../../db/manage/test-manage-client';
import { createAgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { createTestRuntimeDatabaseClient } from '../../db/runtime/test-runtime-client';

describe('Database Clients', () => {
  const originalManageUrl = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  const originalRunUrl = process.env.INKEEP_AGENTS_RUN_DATABASE_URL;

  afterEach(() => {
    if (originalManageUrl) {
      process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL = originalManageUrl;
    } else {
      delete process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
    }
    if (originalRunUrl) {
      process.env.INKEEP_AGENTS_RUN_DATABASE_URL = originalRunUrl;
    } else {
      delete process.env.INKEEP_AGENTS_RUN_DATABASE_URL;
    }
  });

  describe('createManageDatabaseClient', () => {
    it('should create a manage database client with connection string', () => {
      const client = createAgentsManageDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/managedb',
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a manage database client with custom pool size', () => {
      const client = createAgentsManageDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/managedb',
        poolSize: 20,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a manage database client with SSL disabled', () => {
      const client = createAgentsManageDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/managedb',
        ssl: false,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });
  });

  describe('createRuntimeDatabaseClient', () => {
    it('should create a runtime database client with connection string', () => {
      const client = createAgentsRunDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5433/runtimedb',
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a runtime database client with custom pool size', () => {
      const client = createAgentsRunDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5433/runtimedb',
        poolSize: 20,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a runtime database client with SSL disabled', () => {
      const client = createAgentsRunDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5433/runtimedb',
        ssl: false,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });
  });

  describe('createTestManageDatabaseClient', () => {
    it('should create an in-memory manage test database client (PGlite)', async () => {
      const client = await createTestManageDatabaseClient('./drizzle/manage');
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a fresh manage database with migrations applied', async () => {
      const client = await createTestManageDatabaseClient('./drizzle/manage');
      const result = await client.query.projects.findMany();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createTestRuntimeDatabaseClient', () => {
    it('should create an in-memory runtime test database client (PGlite)', async () => {
      const client = await createTestRuntimeDatabaseClient('./drizzle/runtime');
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a fresh runtime database with migrations applied', async () => {
      const client = await createTestRuntimeDatabaseClient('./drizzle/runtime');
      const result = await client.query.conversations.findMany();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
