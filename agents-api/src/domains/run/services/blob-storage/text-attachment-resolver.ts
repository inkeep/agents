import type { FilePart } from '@inkeep/agents-core';
import { normalizeMimeType } from '@inkeep/agents-core/constants/allowed-file-formats';
import { getLogger } from '../../../../logger';
import {
  buildDecodedTextAttachmentBlock,
  buildUnavailableTextAttachmentBlock,
} from '../../utils/text-document-attachments';
import { normalizeInlineFileBytes } from './file-content-security';
import { UnsupportedTextAttachmentSourceError } from './file-security-errors';
import { fromBlobUri, getBlobStorageProvider, isBlobUri } from './index';
import type { BlobStorageDownloadResult } from './types';

const logger = getLogger('text-attachment-resolver');

export interface ResolveTextAttachmentOptions {
  /**
   * When true, throws `UnsupportedTextAttachmentSourceError` if the part has
   * neither inline bytes nor a blob URI. When false (default), returns an
   * `[Attachment unavailable]` block instead so the caller never sees a throw.
   */
  throwIfUnresolvable?: boolean;
}

/**
 * Resolve a text-document `FilePart` into its `<attached_file>...</attached_file>`
 * block — decoded content on success, `[Attachment unavailable]` fallback on any
 * download/decode failure. Accepts both inline-bytes parts (first-turn input) and
 * blob-URI parts (post-upload history rebuild).
 */
export async function resolveTextAttachmentBlock(
  part: FilePart,
  options: ResolveTextAttachmentOptions = {}
): Promise<string> {
  const file = part.file;
  const mimeType = normalizeMimeType(file.mimeType ?? '');
  const filename = typeof part.metadata?.filename === 'string' ? part.metadata.filename : undefined;
  const fallback = () => buildUnavailableTextAttachmentBlock({ mimeType, filename });

  let bytes: Uint8Array;

  if ('bytes' in file && file.bytes) {
    try {
      bytes = (await normalizeInlineFileBytes(file)).data;
    } catch (err) {
      logger.warn(
        { err, mimeType, failureKind: 'normalize' },
        'Failed to normalize inline bytes for text attachment'
      );
      return fallback();
    }
  } else if ('uri' in file && file.uri && isBlobUri(file.uri)) {
    let downloaded: BlobStorageDownloadResult;
    try {
      downloaded = await getBlobStorageProvider().download(fromBlobUri(file.uri));
    } catch (err) {
      logger.warn(
        { err, uri: file.uri, mimeType, failureKind: 'download' },
        'Failed to download text attachment from blob storage'
      );
      return fallback();
    }
    bytes = downloaded.data;
  } else {
    if (options.throwIfUnresolvable) {
      throw new UnsupportedTextAttachmentSourceError(mimeType);
    }
    return fallback();
  }

  try {
    return buildDecodedTextAttachmentBlock({ data: bytes, mimeType, filename });
  } catch (err) {
    logger.warn({ err, mimeType, failureKind: 'decode' }, 'Failed to decode text attachment');
    return fallback();
  }
}
