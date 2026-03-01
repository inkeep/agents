/**
 * Validates image bytes from untrusted sources (uploaded inline bytes or downloaded data).
 *
 * This prevents non-image payloads from being accepted when they are mislabeled as images.
 * Prefer byte-sniffed types over claimed MIME types whenever possible.
 */
import { fileTypeFromBuffer } from 'file-type';
import {
  ALLOWED_EXTERNAL_IMAGE_MIME_TYPES,
  MAX_EXTERNAL_IMAGE_BYTES,
} from './image-security-constants';
import {
  BlockedExternalUnsupportedBytesError,
  BlockedInlineImageExceedingError,
  BlockedInlineUnsupportedBytesError,
  InvalidInlineImageMalformedBase64Error,
} from './image-security-errors';

export async function normalizeInlineImageBytes(file: {
  bytes: string;
  mimeType?: string;
}): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  const data = decodeBase64ImageBytes(file.bytes);
  validateInlineImageSize(data);

  const sniffedMime = await sniffAllowedImageMimeType(data);
  if (sniffedMime) {
    return { data, mimeType: sniffedMime };
  }

  throw new BlockedInlineUnsupportedBytesError(file.mimeType || 'unknown');
}

export async function resolveDownloadedImageMimeType(
  data: Uint8Array,
  headerContentType: string
): Promise<string> {
  const sniffedMime = await sniffAllowedImageMimeType(data);
  if (sniffedMime) {
    return sniffedMime;
  }

  throw new BlockedExternalUnsupportedBytesError(headerContentType || 'unknown');
}

function validateInlineImageSize(data: Uint8Array): void {
  if (data.length > MAX_EXTERNAL_IMAGE_BYTES) {
    throw new BlockedInlineImageExceedingError(MAX_EXTERNAL_IMAGE_BYTES);
  }
}

async function sniffAllowedImageMimeType(data: Uint8Array): Promise<string | null> {
  const sniffed = await fileTypeFromBuffer(data);
  const sniffedMime = sniffed?.mime?.toLowerCase();
  if (sniffedMime && ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(sniffedMime)) {
    return sniffedMime;
  }

  return null;
}

function decodeBase64ImageBytes(base64Bytes: string): Uint8Array {
  const normalized = base64Bytes.replace(/\s+/g, '');
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new InvalidInlineImageMalformedBase64Error();
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== normalized) {
    throw new InvalidInlineImageMalformedBase64Error();
  }

  return Uint8Array.from(decoded);
}
