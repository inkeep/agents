import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManageAppVariables } from '../../../types/app';

// Mock the authz module
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    canViewProject: vi.fn(() => Promise.resolve(true)),
    canUseProject: vi.fn(() => Promise.resolve(true)),
    canEditProject: vi.fn(() => Promise.resolve(false)),
    createApiError: actual.createApiError,
  };
});

// Import mocked functions
import { canEditProject, canUseProject, canViewProject } from '@inkeep/agents-core';
// Import after mocks are set up
import { requireProjectPermission } from '../../../middleware/projectAccess';

describe('requireProjectPermission middleware', () => {
  let app: Hono<{ Variables: ManageAppVariables }>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set ENVIRONMENT to non-test so middleware doesn't bypass
    process.env.ENVIRONMENT = 'development';

    app = new Hono<{ Variables: ManageAppVariables }>();

    // Set up context variables
    app.use('*', async (c, next) => {
      c.set('userId', 'test-user');
      c.set('tenantId', 'test-tenant');
      c.set('tenantRole', 'member');
      c.set('auth', null as any);
      c.set('userEmail', 'test@example.com');
      await next();
    });
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT;
  });

  describe('when in test environment', () => {
    it('should skip checks and allow access', async () => {
      process.env.ENVIRONMENT = 'test';

      app.use('/projects/:projectId', requireProjectPermission('view'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(200);
    });
  });

  describe('for system users', () => {
    it('should bypass project access checks', async () => {
      const systemApp = new Hono<{ Variables: ManageAppVariables }>();
      systemApp.use('*', async (c, next) => {
        c.set('userId', 'system');
        c.set('tenantId', 'test-tenant');
        c.set('tenantRole', 'owner');
        c.set('auth', null as any);
        c.set('userEmail', 'system@example.com');
        await next();
      });
      systemApp.use('/projects/:projectId', requireProjectPermission('edit'));
      systemApp.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await systemApp.request('/projects/test-project');
      expect(res.status).toBe(200);
    });
  });

  describe('for API key users', () => {
    it('should bypass project access checks', async () => {
      const apiKeyApp = new Hono<{ Variables: ManageAppVariables }>();
      apiKeyApp.use('*', async (c, next) => {
        c.set('userId', 'apikey:abc123');
        c.set('tenantId', 'test-tenant');
        c.set('tenantRole', 'owner');
        c.set('auth', null as any);
        c.set('userEmail', '');
        await next();
      });
      apiKeyApp.use('/projects/:projectId', requireProjectPermission('edit'));
      apiKeyApp.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await apiKeyApp.request('/projects/test-project');
      expect(res.status).toBe(200);
    });
  });

  describe('view permission', () => {
    it('should allow access when canViewProject returns true', async () => {
      vi.mocked(canViewProject).mockResolvedValue(true);

      app.use('/projects/:projectId', requireProjectPermission('view'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(200);
      expect(canViewProject).toHaveBeenCalledWith({
        userId: 'test-user',
        projectId: 'test-project',
        orgRole: 'member',
      });
    });

    it('should return 404 when canViewProject returns false', async () => {
      vi.mocked(canViewProject).mockResolvedValue(false);

      app.use('/projects/:projectId', requireProjectPermission('view'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(404);
    });
  });

  describe('use permission', () => {
    it('should allow access when canUseProject returns true', async () => {
      vi.mocked(canUseProject).mockResolvedValue(true);

      app.use('/projects/:projectId', requireProjectPermission('use'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(200);
      expect(canUseProject).toHaveBeenCalled();
    });

    it('should return 404 when canUseProject returns false', async () => {
      vi.mocked(canUseProject).mockResolvedValue(false);

      app.use('/projects/:projectId', requireProjectPermission('use'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(404);
    });
  });

  describe('edit permission', () => {
    it('should allow access when canEditProject returns true', async () => {
      vi.mocked(canEditProject).mockResolvedValue(true);

      app.use('/projects/:projectId', requireProjectPermission('edit'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(200);
      expect(canEditProject).toHaveBeenCalled();
    });

    it('should return 404 when canEditProject returns false', async () => {
      vi.mocked(canEditProject).mockResolvedValue(false);

      app.use('/projects/:projectId', requireProjectPermission('edit'));
      app.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await app.request('/projects/test-project');
      expect(res.status).toBe(404);
    });
  });

  describe('error handling', () => {
    it('should return 401 when userId is missing', async () => {
      const noUserApp = new Hono<{ Variables: ManageAppVariables }>();
      noUserApp.use('*', async (c, next) => {
        c.set('userId', '');
        c.set('tenantId', 'test-tenant');
        c.set('tenantRole', 'member');
        c.set('auth', null as any);
        c.set('userEmail', '');
        await next();
      });
      noUserApp.use('/projects/:projectId', requireProjectPermission('view'));
      noUserApp.get('/projects/:projectId', (c) => c.json({ success: true }));

      const res = await noUserApp.request('/projects/test-project');
      expect(res.status).toBe(401);
    });

    it('should return 400 when projectId is missing', async () => {
      app.use('/no-project-id', requireProjectPermission('view'));
      app.get('/no-project-id', (c) => c.json({ success: true }));

      const res = await app.request('/no-project-id');
      expect(res.status).toBe(400);
    });
  });
});
