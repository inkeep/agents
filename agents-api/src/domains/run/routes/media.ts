import { OpenAPIHono } from '@hono/zod-openapi';
import { getLogger } from '../../../logger';
import { getBlobStorageProvider } from '../services/blob-storage';

const logger = getLogger('media-proxy');

const app = new OpenAPIHono();

app.get('/*', async (c) => {
  const tenantId = c.req.param('tenantId');
  const projectId = c.req.param('projectId');
  const conversationId = c.req.param('id');
  // Extract media key from the path - everything after /media/
  const url = new URL(c.req.url);
  const pathAfterMedia = url.pathname.split('/media/')[1];
  const mediaKey = decodeURIComponent(pathAfterMedia);

  if (!mediaKey || mediaKey.includes('..')) {
    return c.json({ error: 'Invalid media key' }, 400);
  }

  // Reconstruct the full blob storage key: tenantId/projectId/conversationId/mediaKey
  const key = `${tenantId}/${projectId}/${conversationId}/${mediaKey}`;

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
