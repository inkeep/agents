import { OpenAPIHono } from '@hono/zod-openapi';
import { TenantProjectIdParamsSchema } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { getBlobStorageProvider } from '../services/blob-storage';
import { buildMediaStorageKeyPrefix } from '../services/blob-storage/storage-keys';

const logger = getLogger('media-proxy');

const app = new OpenAPIHono();

app.get('/*', async (c) => {
  const paramResult = TenantProjectIdParamsSchema.safeParse({
    tenantId: c.req.param('tenantId'),
    projectId: c.req.param('projectId'),
    id: c.req.param('id'),
  });
  if (!paramResult.success) {
    return c.json({ error: 'Invalid path' }, 400);
  }
  const { tenantId, projectId, id: conversationId } = paramResult.data;

  const url = new URL(c.req.url);
  const pathAfterMedia = url.pathname.split('/media/')[1];
  const mediaKey = decodeURIComponent(pathAfterMedia ?? '');

  if (!mediaKey) {
    return c.json({ error: 'Invalid media key' }, 400);
  }

  const key = `${buildMediaStorageKeyPrefix({ tenantId, projectId, conversationId })}/${mediaKey}`;

  try {
    const storage = getBlobStorageProvider();
    const result = await storage.download(key);

    return new Response(result.data as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable', // route behind requireProjectPermission('view'); URL is immutable per key
        'Content-Length': result.data.length.toString(),
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), key },
      'Failed to serve media'
    );
    return c.json({ error: 'Media not found' }, 404);
  }
});

export default app;
