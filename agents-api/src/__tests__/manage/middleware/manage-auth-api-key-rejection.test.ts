import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateAndGetApiKeyMock, isSlackUserTokenMock, isInternalServiceTokenMock } = vi.hoisted(
  () => ({
    validateAndGetApiKeyMock: vi.fn(),
    isSlackUserTokenMock: vi.fn().mockReturnValue(false),
    isInternalServiceTokenMock: vi.fn().mockReturnValue(false),
  })
);

vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: validateAndGetApiKeyMock,
  isSlackUserToken: isSlackUserTokenMock,
  isInternalServiceToken: isInternalServiceTokenMock,
  verifyInternalServiceAuthHeader: vi.fn(),
  verifySlackUserToken: vi.fn(),
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@inkeep/agents-core/middleware', () => ({
  registerAuthzMeta: vi.fn(),
}));

vi.mock('../../../env.js', () => ({
  env: {
    ENVIRONMENT: 'production',
    INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: 'test-manage-bypass',
  },
}));

vi.mock('../../../data/db/runDbClient.js', () => ({ default: {} }));

vi.mock('../../../middleware/sessionAuth', () => ({
  sessionAuth: () =>
    vi.fn(async (_c: unknown, _next: unknown) => {
      throw new Error('session auth not mocked for this test');
    }),
}));

import { Hono } from 'hono';
import { manageBearerAuth } from '../../../middleware/manageAuth';

const CONVERSATION_PATH = '/manage/tenants/tenant-123/projects/project-456/conversations/conv-789';
const CONVERSATIONS_LIST_PATH = '/manage/tenants/tenant-123/projects/project-456/conversations';
const AGENTS_PATH = '/manage/tenants/tenant-123/projects/project-456/agents';
const CONVERSATION_BOUNDS_PATH =
  '/manage/tenants/tenant-123/projects/project-456/conversations/conv-789/bounds';
const CONVERSATION_MEDIA_PATH =
  '/manage/tenants/tenant-123/projects/project-456/conversations/conv-789/media/some-key';

const VALID_API_KEY_RECORD = {
  id: 'key-1',
  tenantId: 'tenant-123',
  projectId: 'project-456',
  agentId: 'agent-1',
};

describe('Manage Auth - API Key Rejection', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth' as never, {
        api: { getSession: vi.fn().mockResolvedValue(null) },
      });
      await next();
    });
  });

  it('should reject a valid database API key on manage endpoints', async () => {
    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: {
        Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Invalid Token');
    expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
  });

  it('should still accept the bypass secret', async () => {
    app.use('*', manageBearerAuth());
    app.get('/', (c) => {
      return c.json({
        userId: (c as any).get('userId'),
      });
    });

    const res = await app.request('/', {
      headers: {
        Authorization: 'Bearer test-manage-bypass',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('system');
  });

  describe('Legacy API key exception for get-conversation-by-ID', () => {
    it('should accept a valid API key on GET conversation by ID', async () => {
      validateAndGetApiKeyMock.mockResolvedValue(VALID_API_KEY_RECORD);
      app.use('*', manageBearerAuth());
      app.get(CONVERSATION_PATH, (c) =>
        c.json({ userId: (c as any).get('userId'), tenantId: (c as any).get('tenantId') })
      );

      const res = await app.request(CONVERSATION_PATH, {
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('apikey:key-1');
      expect(body.tenantId).toBe('tenant-123');
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(
        'valid-api-key-token',
        expect.anything()
      );
    });

    it('should reject API key on GET conversations list (no conversation ID)', async () => {
      app.use('*', manageBearerAuth());
      app.get(CONVERSATIONS_LIST_PATH, (c) => c.text('OK'));

      const res = await app.request(CONVERSATIONS_LIST_PATH, {
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });

      expect(res.status).toBe(401);
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('should reject API key on non-GET methods for conversation by ID', async () => {
      app.use('*', manageBearerAuth());
      app.post(CONVERSATION_PATH, (c) => c.text('OK'));
      app.delete(CONVERSATION_PATH, (c) => c.text('OK'));

      const postRes = await app.request(CONVERSATION_PATH, {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });
      expect(postRes.status).toBe(401);

      const deleteRes = await app.request(CONVERSATION_PATH, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });
      expect(deleteRes.status).toBe(401);

      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('should reject API key on other manage endpoints', async () => {
      app.use('*', manageBearerAuth());
      app.get(AGENTS_PATH, (c) => c.text('OK'));

      const res = await app.request(AGENTS_PATH, {
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });

      expect(res.status).toBe(401);
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('should reject API key on conversation sub-endpoints (bounds, media)', async () => {
      app.use('*', manageBearerAuth());
      app.get(CONVERSATION_BOUNDS_PATH, (c) => c.text('OK'));
      app.get(CONVERSATION_MEDIA_PATH, (c) => c.text('OK'));

      const boundsRes = await app.request(CONVERSATION_BOUNDS_PATH, {
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });
      expect(boundsRes.status).toBe(401);

      const mediaRes = await app.request(CONVERSATION_MEDIA_PATH, {
        headers: { Authorization: 'Bearer valid-api-key-token' },
      });
      expect(mediaRes.status).toBe(401);

      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('should reject an invalid API key on GET conversation by ID', async () => {
      validateAndGetApiKeyMock.mockResolvedValue(null);
      app.use('*', manageBearerAuth());
      app.get(CONVERSATION_PATH, (c) => c.text('OK'));

      const res = await app.request(CONVERSATION_PATH, {
        headers: { Authorization: 'Bearer invalid-api-key' },
      });

      expect(res.status).toBe(401);
      expect(validateAndGetApiKeyMock).toHaveBeenCalled();
    });
  });
});
