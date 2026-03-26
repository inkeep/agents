import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_EXTERNAL_IMAGE_MIME_TYPES, MAX_FILE_BYTES } from './file-security-constants';
import {
  BlockedExternalUnsupportedBytesError,
  BlockedInlineFileExceedingError,
  BlockedInlineUnsupportedFileBytesError,
  InvalidInlineFileMalformedBase64Error,
} from './file-security-errors';

export async function normalizeInlineImageBytes(file: {
  bytes: string;
  mimeType?: string;
}): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  const normalized = await normalizeInlineFileBytes(file);
  if (normalized.mimeType.startsWith('image/')) {
    return normalized;
  }
  throw new BlockedInlineUnsupportedFileBytesError(file.mimeType || 'unknown');
}

export async function normalizeInlineFileBytes(file: {
  bytes: string;
  mimeType?: string;
}): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  const data = decodeBase64Bytes(file.bytes);
  validateInlineFileSize(data);
  const requestedMimeType = file.mimeType?.split(';')[0]?.trim().toLowerCase();
  const sniffedMime = await sniffAllowedInlineFileMimeType(data, requestedMimeType);
  if (sniffedMime) return { data, mimeType: sniffedMime };

  throw new BlockedInlineUnsupportedFileBytesError(file.mimeType || 'unknown');
}

export async function resolveDownloadedFileMimeType(
  data: Uint8Array,
  headerContentType: string,
  expectedMimeType?: string
): Promise<string> {
  const expected = expectedMimeType?.split(';')[0]?.trim().toLowerCase();

  if (expected === 'application/pdf') {
    if (looksLikePdf(data)) {
      return 'application/pdf';
    }
    throw new BlockedExternalUnsupportedBytesError(headerContentType || expected || 'unknown');
  }

  const sniffedMime = await sniffAllowedImageMimeType(data);
  if (sniffedMime) {
    return sniffedMime;
  }

  throw new BlockedExternalUnsupportedBytesError(headerContentType || expected || 'unknown');
}

function validateInlineFileSize(data: Uint8Array): void {
  if (data.length > MAX_FILE_BYTES) {
    throw new BlockedInlineFileExceedingError(MAX_FILE_BYTES);
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

async function sniffAllowedInlineFileMimeType(
  data: Uint8Array,
  requestedMimeType?: string
): Promise<string | null> {
  if (requestedMimeType === 'application/pdf') {
    if (!looksLikePdf(data)) {
      throw new BlockedInlineUnsupportedFileBytesError(requestedMimeType);
    }
    return 'application/pdf';
  }

  return await sniffAllowedImageMimeType(data);
}

function decodeBase64Bytes(base64Bytes: string): Uint8Array {
  const normalized = base64Bytes.replace(/\s+/g, '');
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new InvalidInlineFileMalformedBase64Error();
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== normalized) {
    throw new InvalidInlineFileMalformedBase64Error();
  }

  return Uint8Array.from(decoded);
}

function looksLikePdf(data: Uint8Array): boolean {
  if (data.length < 5) {
    return false;
  }
  return (
    data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d
  );
}
