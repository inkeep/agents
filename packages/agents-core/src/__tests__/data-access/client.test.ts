import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('Database Client', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    // Restore original DATABASE_URL
    if (originalEnv) {
      process.env.DATABASE_URL = originalEnv;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  describe('createDatabaseClient', () => {
    it('should create a database client with connection string', () => {
      const client = createDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/testdb',
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client from DATABASE_URL env var', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
      const client = createDatabaseClient();
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with custom pool size', () => {
      const client = createDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/testdb',
        poolSize: 20,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with SSL disabled', () => {
      const client = createDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/testdb',
        ssl: false,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with logger', () => {
      const mockLogger = {
        logQuery: vi.fn((query: string, params: unknown[]) => {
          console.log('Query:', query, 'Params:', params);
        }),
      };

      const client = createDatabaseClient({
        connectionString: 'postgres://user:pass@localhost:5432/testdb',
        logger: mockLogger,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });
  });

  describe('createTestDatabaseClient', () => {
    it('should create an in-memory test database client (PGlite)', async () => {
      const client = await createTestDatabaseClient();
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a fresh database with migrations applied', async () => {
      const client = await createTestDatabaseClient();

      // Should be able to query the database (migrations applied)
      const result = await client.query.projects.findMany();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
