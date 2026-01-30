import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getProjectAccessModeMock,
  getProjectRepositoryAccessMock,
  getProjectRepositoryAccessWithDetailsMock,
  setProjectAccessModeMock,
  setProjectRepositoryAccessMock,
  validateRepositoryOwnershipMock,
} = vi.hoisted(() => ({
  getProjectAccessModeMock: vi.fn(),
  getProjectRepositoryAccessMock: vi.fn(),
  getProjectRepositoryAccessWithDetailsMock: vi.fn(),
  setProjectAccessModeMock: vi.fn(),
  setProjectRepositoryAccessMock: vi.fn(),
  validateRepositoryOwnershipMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getProjectAccessMode: () => getProjectAccessModeMock,
    getProjectRepositoryAccess: () => getProjectRepositoryAccessMock,
    getProjectRepositoryAccessWithDetails: () => getProjectRepositoryAccessWithDetailsMock,
    setProjectAccessMode: () => setProjectAccessModeMock,
    setProjectRepositoryAccess: () => setProjectRepositoryAccessMock,
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

import projectGitHubAccessRoutes from '../../../domains/manage/routes/projectGithubAccess';

const TEST_TENANT_ID = 'test-tenant-123';
const TEST_PROJECT_ID = 'test-project-456';

function createTestApp() {
  const app = new OpenAPIHono();
  app.route('/:tenantId/projects/:projectId/github-access', projectGitHubAccessRoutes);
  return app;
}

const app = createTestApp();

describe('Project GitHub Access Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectAccessModeMock.mockResolvedValue('selected');
    setProjectAccessModeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /projects/:projectId/github-access', () => {
    it('should return mode=all when access mode is set to all', async () => {
      getProjectAccessModeMock.mockResolvedValue('all');

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('all');
      expect(body.repositories).toEqual([]);
    });

    it('should return mode=selected with repositories when access entries exist', async () => {
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
        },
      ];

      getProjectRepositoryAccessWithDetailsMock.mockResolvedValue(mockRepositories);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('selected');
      expect(body.repositories).toHaveLength(2);
      expect(body.repositories[0]).toEqual({
        id: 'repo-1',
        installationDbId: 'inst-1',
        repositoryId: '100001',
        repositoryName: 'my-repo',
        repositoryFullName: 'my-org/my-repo',
        private: false,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      });
    });

    it('should not include accessId in repository response', async () => {
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
        },
      ];

      getProjectRepositoryAccessWithDetailsMock.mockResolvedValue(mockRepositories);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories[0].accessId).toBeUndefined();
    });

    it('should handle private repositories correctly', async () => {
      const mockRepositories = [
        {
          accessId: 'access-1',
          id: 'repo-1',
          installationDbId: 'inst-1',
          repositoryId: '100001',
          repositoryName: 'private-repo',
          repositoryFullName: 'my-org/private-repo',
          private: true,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      getProjectRepositoryAccessWithDetailsMock.mockResolvedValue(mockRepositories);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        { method: 'GET' }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories[0].private).toBe(true);
    });
  });

  describe('PUT /projects/:projectId/github-access', () => {
    it('should set mode=all successfully', async () => {
      setProjectRepositoryAccessMock.mockResolvedValue(undefined);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'all',
      });
      expect(setProjectRepositoryAccessMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds: [],
      });
    });

    it('should set mode=selected with valid repository IDs', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue([]);
      setProjectRepositoryAccessMock.mockResolvedValue(undefined);

      const repositoryIds = ['repo-1', 'repo-2', 'repo-3'];

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'selected',
      });
      expect(setProjectRepositoryAccessMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds,
      });
    });

    it('should return 400 when mode=selected without repositoryIds', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should return 400 when mode=selected with empty repositoryIds array', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should return 400 when repositoryIds contain invalid IDs', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue(['invalid-repo-1', 'invalid-repo-2']);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectRepositoryAccessMock).not.toHaveBeenCalled();
    });

    it('should ignore repositoryIds when mode=all', async () => {
      setProjectRepositoryAccessMock.mockResolvedValue(undefined);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
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
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'all',
      });
      expect(setProjectRepositoryAccessMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        repositoryIds: [],
      });
    });

    it('should return 400 for invalid mode', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'invalid' }),
        }
      );

      expect(response.status).toBe(400);
    });

    it('should handle single repository ID', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue([]);
      setProjectRepositoryAccessMock.mockResolvedValue(undefined);

      const response = await app.request(
        `/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selected', repositoryIds: ['repo-1'] }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.mode).toBe('selected');
      expect(body.repositoryCount).toBe(1);
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        mode: 'selected',
      });
    });

    it('should validate all repository IDs belong to tenant', async () => {
      validateRepositoryOwnershipMock.mockResolvedValue([]);
      setProjectRepositoryAccessMock.mockResolvedValue(undefined);

      const repositoryIds = ['repo-1', 'repo-2'];

      await app.request(`/${TEST_TENANT_ID}/projects/${TEST_PROJECT_ID}/github-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'selected', repositoryIds }),
      });

      expect(validateRepositoryOwnershipMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        repositoryIds,
      });
    });
  });
});
