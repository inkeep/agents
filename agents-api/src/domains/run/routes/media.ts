import { OpenAPIHono } from '@hono/zod-openapi';
import { TenantProjectIdParamsSchema } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import { getBlobStorageProvider } from '../services/blob-storage';
import { buildMediaStorageKeyPrefix } from '../services/blob-storage/storage-keys';

const logger = getLogger('media-proxy');

const app = new OpenAPIHono();

app.use('/*', requireProjectPermission('view'));

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

  if (!pathAfterMedia) {
    return c.json({ error: 'Invalid media key' }, 400);
  }

  // Decode once for validation; the storage layer will perform its own single decode
  let decodedForValidation: string;
  try {
    decodedForValidation = decodeURIComponent(pathAfterMedia);
  } catch {
    return c.json({ error: 'Invalid media key' }, 400);
  }

  if (
    !decodedForValidation ||
    decodedForValidation.includes('\0') ||
    decodedForValidation.includes('\\') ||
    decodedForValidation.split('/').some((segment) => segment === '..')
  ) {
    return c.json({ error: 'Invalid media key' }, 400);
  }

  // Pass the still-encoded path so the storage layer decodes exactly once
  const key = `${buildMediaStorageKeyPrefix({ tenantId, projectId, conversationId })}/${pathAfterMedia}`;

  try {
    const storage = getBlobStorageProvider();
    const result = await storage.download(key);

    return new Response(result.data as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
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
