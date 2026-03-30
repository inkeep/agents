import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadMock, loggerErrorMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../domains/run/services/blob-storage', () => ({
  getBlobStorageProvider: () => ({
    download: downloadMock,
  }),
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../middleware/projectAccess', () => ({
  requireProjectPermission: () => async (_c: { json: unknown }, next: () => Promise<void>) => {
    await next();
  },
}));

import conversationsRoutes from '../../../domains/manage/routes/conversations';

function createTestApp() {
  const app = new OpenAPIHono();
  app.use('*', async (c, next) => {
    c.set('requestId', 'req-test-1');
    await next();
  });
  app.route('/tenants/:tenantId/projects/:projectId/conversations', conversationsRoutes);
  return app;
}

describe('Conversation media route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves media with expected headers', async () => {
    downloadMock.mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
    const app = createTestApp();

    const response = await app.request(
      '/tenants/default/projects/test-project/conversations/conv-1/media/m_msg001%2Fsha256-abc.png'
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
  });

  it('rejects traversal media keys', async () => {
    const app = createTestApp();

    const response = await app.request(
      '/tenants/default/projects/test-project/conversations/conv-1/media/%2e%2e%2Fsecret.txt'
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid media key' });
  });

  it('returns 404 for missing media keys from storage', async () => {
    downloadMock.mockRejectedValue(new Error('S3 download failed for key m_key: NoSuchKey'));
    const app = createTestApp();

    const response = await app.request(
      '/tenants/default/projects/test-project/conversations/conv-1/media/m_msg001%2Fmissing.png'
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Media not found' });
  });

  it('returns 502 for storage infrastructure errors and logs context', async () => {
    downloadMock.mockRejectedValue(new Error('S3 download failed: connect ETIMEDOUT'));
    const app = createTestApp();

    const response = await app.request(
      '/tenants/default/projects/test-project/conversations/conv-1/media/m_msg001%2Ftimeout.png'
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to retrieve media' });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-test-1',
        tenantId: 'default',
        projectId: 'test-project',
        conversationId: 'conv-1',
      }),
      'Failed to serve media'
    );
  });
});
