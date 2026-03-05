import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteAllSlackMcpToolAccessConfigsByTenant,
  deleteSlackMcpToolAccessConfig,
  getSlackMcpToolAccessConfig,
  setSlackMcpToolAccessConfig,
} from '../../data-access/runtime/slack-work-app-mcp';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { organization, workAppSlackMcpToolAccessConfig } from '../../db/runtime/runtime-schema';
import { testRunDbClient } from '../setup';

describe('Slack MCP Tool Access Config', () => {
  let dbClient: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant-slack-mcp';
  const projectId = 'test-project-slack';
  const toolId = 'test-tool-slack-123';

  beforeAll(async () => {
    dbClient = testRunDbClient;
  });

  beforeEach(async () => {
    await dbClient.delete(workAppSlackMcpToolAccessConfig);
    await dbClient
      .insert(organization)
      .values({
        id: tenantId,
        name: 'Test Organization Slack MCP',
        slug: 'test-org-slack-mcp',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });

  describe('getSlackMcpToolAccessConfig', () => {
    it('should return defaults when no row exists', async () => {
      const config = await getSlackMcpToolAccessConfig(dbClient)(toolId);

      expect(config).toEqual({
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: [],
      });
    });

    it('should return stored config', async () => {
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: ['C123', 'C456'],
      });

      const config = await getSlackMcpToolAccessConfig(dbClient)(toolId);

      expect(config).toEqual({
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: ['C123', 'C456'],
      });
    });
  });

  describe('setSlackMcpToolAccessConfig', () => {
    it('should create a new config row', async () => {
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C789'],
      });

      const config = await getSlackMcpToolAccessConfig(dbClient)(toolId);

      expect(config.channelAccessMode).toBe('selected');
      expect(config.dmEnabled).toBe(false);
      expect(config.channelIds).toEqual(['C789']);
    });

    it('should update an existing config row', async () => {
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C123'],
      });

      await setSlackMcpToolAccessConfig(dbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });

      const config = await getSlackMcpToolAccessConfig(dbClient)(toolId);

      expect(config.channelAccessMode).toBe('all');
      expect(config.dmEnabled).toBe(true);
      expect(config.channelIds).toEqual([]);
    });
  });

  describe('deleteSlackMcpToolAccessConfig', () => {
    it('should delete config by toolId', async () => {
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });

      const deleted = await deleteSlackMcpToolAccessConfig(dbClient)(toolId);
      expect(deleted).toBe(true);

      const config = await getSlackMcpToolAccessConfig(dbClient)(toolId);
      expect(config).toEqual({
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: [],
      });
    });

    it('should return false when no config exists', async () => {
      const deleted = await deleteSlackMcpToolAccessConfig(dbClient)('nonexistent-tool');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteAllSlackMcpToolAccessConfigsByTenant', () => {
    it('should delete all configs for a tenant', async () => {
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId: 'tool-1',
        tenantId,
        projectId,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId: 'tool-2',
        tenantId,
        projectId,
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C123'],
      });

      const deleted = await deleteAllSlackMcpToolAccessConfigsByTenant(dbClient)(tenantId);
      expect(deleted).toBe(2);

      const config1 = await getSlackMcpToolAccessConfig(dbClient)('tool-1');
      const config2 = await getSlackMcpToolAccessConfig(dbClient)('tool-2');
      expect(config1.channelAccessMode).toBe('selected');
      expect(config2.channelAccessMode).toBe('selected');
    });

    it('should return 0 when no configs exist for tenant', async () => {
      const deleted = await deleteAllSlackMcpToolAccessConfigsByTenant(dbClient)('nonexistent-tenant');
      expect(deleted).toBe(0);
    });

    it('should not delete configs for other tenants', async () => {
      const otherTenantId = 'other-tenant-slack-mcp';
      await dbClient
        .insert(organization)
        .values({
          id: otherTenantId,
          name: 'Other Org',
          slug: 'other-org-slack-mcp',
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      await setSlackMcpToolAccessConfig(dbClient)({
        toolId: 'tool-tenant-1',
        tenantId,
        projectId,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });
      await setSlackMcpToolAccessConfig(dbClient)({
        toolId: 'tool-other-tenant',
        tenantId: otherTenantId,
        projectId,
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C999'],
      });

      const deleted = await deleteAllSlackMcpToolAccessConfigsByTenant(dbClient)(tenantId);
      expect(deleted).toBe(1);

      const otherConfig = await getSlackMcpToolAccessConfig(dbClient)('tool-other-tenant');
      expect(otherConfig.channelAccessMode).toBe('selected');
      expect(otherConfig.channelIds).toEqual(['C999']);
    });
  });
});
