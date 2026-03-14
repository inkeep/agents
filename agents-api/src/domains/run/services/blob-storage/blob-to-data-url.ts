import { getLogger } from '../../../../logger';
import type { BlobStorageProvider } from './types';

const logger = getLogger('blob-to-data-url');

export type HydrateBlobToDataUrl = (
  blobUri: string,
  fallbackMimeType?: string
) => Promise<string | null>;

export function createBlobToDataUrlHydrator(
  storage: BlobStorageProvider,
  fromBlobUri: (uri: string) => string
): HydrateBlobToDataUrl {
  const cache = new Map<string, string | null>();

  return async (blobUri: string, fallbackMimeType?: string): Promise<string | null> => {
    if (cache.has(blobUri)) {
      return cache.get(blobUri) ?? null;
    }

    try {
      const key = fromBlobUri(blobUri);
      const downloaded = await storage.download(key);
      const mimeType = downloaded.contentType || fallbackMimeType || 'application/octet-stream';
      const dataUrl = `data:${mimeType};base64,${Buffer.from(downloaded.data).toString('base64')}`;
      cache.set(blobUri, dataUrl);
      return dataUrl;
    } catch (error) {
      logger.warn(
        { error, blobUri },
        'Failed to hydrate blob URI for multimodal conversation history replay'
      );
      cache.set(blobUri, null);
      return null;
    }
  };
}
