import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import * as runtimeSchema from '../../db/runtime/runtime-schema';
import {
  deleteExpiredPendingToolAuth,
  deletePendingToolAuth,
  findPendingToolAuthByUserAndTool,
  insertPendingToolAuth,
} from '../runtime/pendingToolAuth';

vi.mock('../../logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

describe('pendingToolAuth data access', () => {
  let db: AgentsRunDatabaseClient;
  let pglite: PGlite;

  const TEST_TENANT_ID = 'org_test_pta';
  const TEST_PROJECT_ID = 'proj_test_pta';
  const TEST_USER_ID = 'user_abc123';
  const TEST_TOOL_ID = 'tool_github';
  const TEST_TOOL_NAME = 'GitHub';

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema: runtimeSchema }) as unknown as AgentsRunDatabaseClient;

    const isInPackageDir = process.cwd().includes('agents-core');
    const migrationsPath = isInPackageDir
      ? './drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(drizzle(pglite), {
      migrationsFolder: migrationsPath,
    });
  });

  beforeEach(async () => {
    await db.delete(runtimeSchema.pendingToolAuthRequests);
  });

  describe('insertPendingToolAuth', () => {
    it('should insert a pending tool auth request', async () => {
      const result = await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-123',
        agentId: 'agent-1',
        surfaceType: 'slack',
        surfaceContext: { channel: 'C123', threadTs: '1234.5678' },
      });

      expect(result.id).toMatch(/^pta_/);
      expect(result.tenantId).toBe(TEST_TENANT_ID);
      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.toolId).toBe(TEST_TOOL_ID);
      expect(result.toolName).toBe(TEST_TOOL_NAME);
      expect(result.surfaceType).toBe('slack');
      expect(result.surfaceContext).toEqual({ channel: 'C123', threadTs: '1234.5678' });
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('findPendingToolAuthByUserAndTool', () => {
    it('should find pending requests by user and tool', async () => {
      await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-2',
        agentId: 'agent-1',
      });

      const results = await findPendingToolAuthByUserAndTool(db)(TEST_USER_ID, TEST_TOOL_ID);

      expect(results).toHaveLength(2);
      expect(results[0].userId).toBe(TEST_USER_ID);
      expect(results[0].toolId).toBe(TEST_TOOL_ID);
    });

    it('should return empty array when no matching records exist', async () => {
      const results = await findPendingToolAuthByUserAndTool(db)('nonexistent', TEST_TOOL_ID);
      expect(results).toHaveLength(0);
    });

    it('should not return records for a different tool', async () => {
      await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      const results = await findPendingToolAuthByUserAndTool(db)(TEST_USER_ID, 'other-tool');
      expect(results).toHaveLength(0);
    });
  });

  describe('deletePendingToolAuth', () => {
    it('should delete a pending request by id', async () => {
      const inserted = await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      await deletePendingToolAuth(db)(inserted.id);

      const results = await findPendingToolAuthByUserAndTool(db)(TEST_USER_ID, TEST_TOOL_ID);
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteExpiredPendingToolAuth', () => {
    it('should delete records older than the given date', async () => {
      await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      // Delete records older than 1 second in the future (should catch all)
      const futureDate = new Date(Date.now() + 1000);
      await deleteExpiredPendingToolAuth(db)(futureDate);

      const results = await findPendingToolAuthByUserAndTool(db)(TEST_USER_ID, TEST_TOOL_ID);
      expect(results).toHaveLength(0);
    });

    it('should not delete recent records', async () => {
      await insertPendingToolAuth(db)({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        userId: TEST_USER_ID,
        toolId: TEST_TOOL_ID,
        toolName: TEST_TOOL_NAME,
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      // Delete records older than 1 day ago (should not catch newly inserted)
      const pastDate = new Date(Date.now() - 86400000);
      await deleteExpiredPendingToolAuth(db)(pastDate);

      const results = await findPendingToolAuthByUserAndTool(db)(TEST_USER_ID, TEST_TOOL_ID);
      expect(results).toHaveLength(1);
    });
  });
});
