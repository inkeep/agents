import { describe, expect, it } from 'vitest';
import { createDatabaseClient, createInMemoryDatabaseClient } from '../../db/client.js';

describe('Database Client', () => {
  describe('createDatabaseClient', () => {
    it('should create a database client with file URL', () => {
      const client = createDatabaseClient({ url: 'file:test.db' });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with in-memory URL', () => {
      const client = createDatabaseClient({ url: ':memory:' });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with auth token', () => {
      const client = createDatabaseClient({
        url: 'libsql://localhost:8080',
        authToken: 'test-token',
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });

    it('should create a database client with logger', () => {
      const mockLogger = {
        logQuery: (query: string, params: unknown[]) => {
          console.log('Query:', query, 'Params:', params);
        },
      };

      const client = createDatabaseClient({
        url: ':memory:',
        logger: mockLogger,
      });
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });
  });

  describe('createInMemoryDatabaseClient', () => {
    it('should create an in-memory database client', () => {
      const client = createInMemoryDatabaseClient();
      expect(client).toBeDefined();
      expect(client.query).toBeDefined();
    });
  });
});
