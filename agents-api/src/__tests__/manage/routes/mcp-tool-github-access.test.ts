import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getToolByIdMock,
  getMcpToolAccessModeMock,
  getMcpToolRepositoryAccessMock,
  getMcpToolRepositoryAccessWithDetailsMock,
  setMcpToolAccessModeMock,
  setMcpToolRepositoryAccessMock,
  validateRepositoryOwnershipMock,
} = vi.hoisted(() => ({
  getToolByIdMock: vi.fn(),
  getMcpToolAccessModeMock: vi.fn(),
  getMcpToolRepositoryAccessMock: vi.fn(),
  getMcpToolRepositoryAccessWithDetailsMock: vi.fn(),
  setMcpToolAccessModeMock: vi.fn(),
  setMcpToolRepositoryAccessMock: vi.fn(),
  validateRepositoryOwnershipMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getToolById: () => getToolByIdMock,
    getMcpToolAccessMode: () => getMcpToolAccessModeMock,
    getMcpToolRepositoryAccess: () => getMcpToolRepositoryAccessMock,
    getMcpToolRepositoryAccessWithDetails: () => getMcpToolRepositoryAccessWithDetailsMock,
    setMcpToolAccessMode: () => setMcpToolAccessModeMock,
    setMcpToolRepositoryAccess: () => setMcpToolRepositoryAccessMock,
    validateRepositoryOwnership: () => validateRepositoryOwnershipMock,
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

import mcpToolGitHubAccessRoutes from '../../../domains/manage/routes/mcpToolGithubAccess';

const TEST_TENANT_ID = 'test-tenant-123';
const TEST_PROJECT_ID = 'test-project-456';
const TEST_TOOL_ID = 'test-tool-789';

const VALID_GITHUB_WORKAPP_TOOL = {
  id: TEST_TOOL_ID,
  tenantId: TEST_TENANT_ID,
  projectId: TEST_PROJECT_ID,
  name: 'GitHub MCP',
  isWorkApp: true,
  config: {
    type: 'mcp' as const,
    mcp: {
      server: {
        url: 'https://api.example.com/github/mcp',
      },
    },
  },
};

const NON_WORKAPP_TOOL = {
  ...VALID_GITHUB_WORKAPP_TOOL,
  isWorkApp: false,
};

const NON_GITHUB_WORKAPP_TOOL = {
  ...VALID_GITHUB_WORKAPP_TOOL,
  config: {
    type: 'mcp' as const,
    mcp: {
      server: {
        url: 'https://api.example.com/slack/mcp',
      },
    },
  },
};

function createTestApp() {
  const app = new OpenAPIHono();
  app.route(
    '/:tenantId/projects/:projectId/tools/:toolId/github-access',
    mcpToolGitHubAccessRoutes
  );
  return app;
}

const app = createTestApp();

describe('MCP Tool GitHub Access Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToolByIdMock.mockResolvedValue(VALID_GITHUB_WORKAPP_TOOL);
    getMcpToolAccessModeMock.mockResolvedValue('selected');
    setMcpToolAccessModeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /tools/:toolId/github-access', () => {
    it('should return mode=all when access mode is set to all', async () => {
      getMcpToolAccessModeMock.mockResolvedValue('all');

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('all');
      expect(body.repositories).toEqual([]);
    });

    it('should return mode=selected with repositories when access entries exist', async () => {
      const mockAccessEntries = [
        { id: 'access-1', toolId: TEST_TOOL_ID, repositoryDbId: 'repo-1' },
      ];
      const mockRepositories = [
        {
          accessId: 'access-1',
          id: 'repo-1',
          installationDbId: 'inst-1',
          repositoryId: '100001',
          repositoryName: 'my-repo',
          repositoryFullName: 'my-org/my-repo',
          private: false,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
          installationAccountLogin: 'my-org',
        },
        {
          accessId: 'access-2',
          id: 'repo-2',
          installationDbId: 'inst-1',
          repositoryId: '100002',
          repositoryName: 'another-repo',
          repositoryFullName: 'my-org/another-repo',
          private: true,
          createdAt: '2024-01-16T10:00:00.000Z',
          updatedAt: '2024-01-16T10:00:00.000Z',
          installationAccountLogin: 'my-org',
        },
      ];

      getMcpToolRepositoryAccessMock.mockResolvedValue(mockAccessEntries);
      getMcpToolRepositoryAccessWithDetailsMock.mockResolvedValue(mockRepositories);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('selected');
      expect(body.repositories).toHaveLength(2);
      expect(body.repositories[0]).toMatchObject({
        id: 'repo-1',
        installationDbId: 'inst-1',
        repositoryId: '100001',
        repositoryName: 'my-repo',
        repositoryFullName: 'my-org/my-repo',
        private: false,
        installationAccountLogin: 'my-org',
      });
    });

    it('should return 404 when tool not found', async () => {
      getToolByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toContain('Tool not found');
    });

    it('should return 400 when tool is not a workapp', async () => {
      getToolByIdMock.mockResolvedValue(NON_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('workapp MCP tools');
    });

    it('should return 400 when tool is not a GitHub MCP', async () => {
      getToolByIdMock.mockResolvedValue(NON_GITHUB_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('GitHub MCP tools');
    });
  });

  describe('PUT /tools/:toolId/github-access', () => {
    it('should set mode=all successfully', async () => {
      setMcpToolRepositoryAccessMock.mockResolvedValue(undefined);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all' }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('all');
      expect(body.repositoryCount).toBe(0);
      expect(setMcpToolAccessModeMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'all',
      });
      expect(setMcpToolRepositoryAccessMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds: [],
      });
    });

    it('should set mode=selected with valid repository IDs', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue([]);
      setMcpToolRepositoryAccessMock.mockResolvedValue(undefined);

      const repositoryIds = ['repo-1', 'repo-2', 'repo-3'];

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selected', repositoryIds }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('selected');
      expect(body.repositoryCount).toBe(3);
      expect(validateRepositoryOwnershipMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        repositoryIds,
      });
      expect(setMcpToolAccessModeMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'selected',
      });
      expect(setMcpToolRepositoryAccessMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds,
      });
    });

    it('should return 400 when mode=selected without repositoryIds', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selected' }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('repositoryIds is required');
      expect(setMcpToolRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should return 400 when mode=selected with empty repositoryIds array', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selected', repositoryIds: [] }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('repositoryIds is required');
      expect(setMcpToolRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should return 400 when repositoryIds contain invalid IDs', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue(['invalid-repo-1', 'invalid-repo-2']);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'selected',
            repositoryIds: ['repo-1', 'invalid-repo-1', 'invalid-repo-2'],
          }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('Invalid repository IDs');
      expect(body.error.message).toContain('invalid-repo-1');
      expect(body.error.message).toContain('invalid-repo-2');
      expect(setMcpToolRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should return 404 when tool not found', async () => {
      getToolByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all' }),
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.error.code).toBe('not_found');
    });

    it('should return 400 when tool is not a workapp', async () => {
      getToolByIdMock.mockResolvedValue(NON_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all' }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('workapp MCP tools');
    });

    it('should return 400 when tool is not a GitHub MCP', async () => {
      getToolByIdMock.mockResolvedValue(NON_GITHUB_WORKAPP_TOOL);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all' }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('GitHub MCP tools');
    });

    it('should ignore repositoryIds when mode=all', async () => {
      setMcpToolRepositoryAccessMock.mockResolvedValue(undefined);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/tools/${TEST_TOOL_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all', repositoryIds: ['repo-1', 'repo-2'] }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('all');
      expect(body.repositoryCount).toBe(0);
      expect(validateRepositoryOwnershipMock).not.toHaveBeenCalled();
      expect(setMcpToolAccessModeMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'all',
      });
      expect(setMcpToolRepositoryAccessMock).toHaveBeenCalledWith({
        toolId: TEST_TOOL_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds: [],
      });
    });
  });
});
