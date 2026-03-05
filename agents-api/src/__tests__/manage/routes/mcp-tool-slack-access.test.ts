import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getToolByIdMock, getSlackMcpToolAccessConfigMock, setSlackMcpToolAccessConfigMock } =
  vi.hoisted(() => ({
    getToolByIdMock: vi.fn(),
    getSlackMcpToolAccessConfigMock: vi.fn(),
    setSlackMcpToolAccessConfigMock: vi.fn(),
  }));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getToolById: () => getToolByIdMock,
    getSlackMcpToolAccessConfig: () => getSlackMcpToolAccessConfigMock,
    setSlackMcpToolAccessConfig: () => setSlackMcpToolAccessConfigMock,
  };
});

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../middleware/projectAccess', () => ({
  requireProjectPermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import mcpToolSlackAccessRoutes from '../../../domains/manage/routes/mcpToolSlackAccess';

const TEST_TENANT_ID = 'test-tenant-123';
const TEST_PROJECT_ID = 'test-project-456';
const TEST_TOOL_ID = 'test-tool-789';

const VALID_SLACK_WORKAPP_TOOL = {
  id: TEST_TOOL_ID,
  tenantId: TEST_TENANT_ID,
  projectId: TEST_PROJECT_ID,
  name: 'Slack MCP',
  isWorkApp: true,
  config: {
    type: 'mcp' as const,
    mcp: {
      server: {
        url: 'https://api.example.com/slack/mcp',
      },
    },
  },
};

const NON_WORKAPP_TOOL = {
  ...VALID_SLACK_WORKAPP_TOOL,
  isWorkApp: false,
};

const NON_SLACK_WORKAPP_TOOL = {
  ...VALID_SLACK_WORKAPP_TOOL,
  config: {
    type: 'mcp' as const,
    mcp: {
      server: {
        url: 'https://api.example.com/github/mcp',
      },
    },
  },
};

function createTestApp() {
  const app = new OpenAPIHono();
  app.route('/:tenantId/projects/:projectId/tools/:toolId/slack-access', mcpToolSlackAccessRoutes);
  return app;
}

const app = createTestApp();

describe('MCP Tool Slack Access Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToolByIdMock.mockResolvedValue(VALID_SLACK_WORKAPP_TOOL);
    getSlackMcpToolAccessConfigMock.mockResolvedValue({
      channelAccessMode: 'selected',
      dmEnabled: false,
      channelIds: [],
    });
    setSlackMcpToolAccessConfigMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /tools/:toolId/slack-access', () => {
    it('should return config with channelAccessMode=all', async () => {
      getSlackMcpToolAccessConfigMock.mockResolvedValue({
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.channelAccessMode).toBe('all');
      expect(body.dmEnabled).toBe(true);
      expect(body.channelIds).toEqual([]);
    });

    it('should return config with channelAccessMode=selected and channels', async () => {
      getSlackMcpToolAccessConfigMock.mockResolvedValue({
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C123', 'C456'],
      });

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.channelAccessMode).toBe('selected');
      expect(body.dmEnabled).toBe(false);
      expect(body.channelIds).toEqual(['C123', 'C456']);
    });

    it('should return 404 when tool not found', async () => {
      getToolByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('not_found');
    });

    it('should return 400 when tool is not a workapp', async () => {
      getToolByIdMock.mockResolvedValue(NON_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('workapp MCP tools');
    });

    it('should return 400 when tool is not a Slack MCP', async () => {
      getToolByIdMock.mockResolvedValue(NON_SLACK_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('Slack MCP tools');
    });
  });

  describe('PUT /tools/:toolId/slack-access', () => {
    it('should set channelAccessMode=all successfully', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelAccessMode: 'all', dmEnabled: true }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.channelAccessMode).toBe('all');
      expect(body.dmEnabled).toBe(true);
      expect(body.channelIds).toEqual([]);
      expect(setSlackMcpToolAccessConfigMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });
    });

    it('should set channelAccessMode=selected with valid channel IDs', async () => {
      const channelIds = ['C123', 'C456', 'C789'];

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelAccessMode: 'selected',
            dmEnabled: false,
            channelIds,
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.channelAccessMode).toBe('selected');
      expect(body.dmEnabled).toBe(false);
      expect(body.channelIds).toEqual(['C123', 'C456', 'C789']);
      expect(setSlackMcpToolAccessConfigMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds,
      });
    });

    it('should return 400 when channelAccessMode=selected without channelIds', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelAccessMode: 'selected', dmEnabled: false }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('channelIds is required');
    });

    it('should return 400 when channelAccessMode=selected with empty channelIds', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelAccessMode: 'selected',
            dmEnabled: false,
            channelIds: [],
          }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('channelIds is required');
    });

    it('should return 404 when tool not found', async () => {
      getToolByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelAccessMode: 'all', dmEnabled: false }),
        }
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 when tool is not a workapp', async () => {
      getToolByIdMock.mockResolvedValue(NON_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelAccessMode: 'all', dmEnabled: false }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('workapp MCP tools');
    });

    it('should return 400 when tool is not a Slack MCP', async () => {
      getToolByIdMock.mockResolvedValue(NON_SLACK_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/slack-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelAccessMode: 'all', dmEnabled: false }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('Slack MCP tools');
    });
  });
});
