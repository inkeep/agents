import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
});
