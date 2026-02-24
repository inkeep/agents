import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { fileTypeFromBuffer } from 'file-type';
import * as ipaddr from 'ipaddr.js';
import { getLogger } from '../../../../logger';

const logger = getLogger('image-security');

export const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;
const MAX_EXTERNAL_REDIRECTS = 3;
const ALLOWED_EXTERNAL_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
]);
const ALLOWED_HTTP_PORTS = new Set(['', '80', '443']);

export async function downloadExternalImage(
  url: string
): Promise<{ data: Uint8Array; mimeType: string }> {
  let currentUrl = validateExternalImageUrl(url);
  await validateUrlResolvesToPublicIp(currentUrl);

  for (let redirectCount = 0; redirectCount <= MAX_EXTERNAL_REDIRECTS; redirectCount++) {
    const response = await fetch(currentUrl.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect response missing location header: ${currentUrl.toString()}`);
      }

      if (redirectCount === MAX_EXTERNAL_REDIRECTS) {
        throw new Error(`Too many redirects while downloading image: ${url}`);
      }

      currentUrl = validateExternalImageUrl(new URL(location, currentUrl).toString());
      await validateUrlResolvesToPublicIp(currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to download image from ${currentUrl.toString()}: ${response.status} ${response.statusText}`
      );
    }

    const headerContentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (headerContentType && !ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(headerContentType)) {
      throw new Error(`Blocked external image with non-image content-type: ${headerContentType}`);
    }

    const contentLength = response.headers.get('content-length');
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > MAX_EXTERNAL_IMAGE_BYTES
    ) {
      throw new Error(
        `Blocked external image larger than ${MAX_EXTERNAL_IMAGE_BYTES} bytes: ${contentLength}`
      );
    }

    const data = await readResponseBytesWithLimit(response, MAX_EXTERNAL_IMAGE_BYTES);
    const sniffed = await fileTypeFromBuffer(data);
    const sniffedMime = sniffed?.mime?.toLowerCase();

    if (sniffedMime && ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(sniffedMime)) {
      return { data, mimeType: sniffedMime };
    }
    if (headerContentType === 'image/svg+xml' && looksLikeSvg(data)) {
      return { data, mimeType: 'image/svg+xml' };
    }
    throw new Error(
      `Blocked external image with unsupported bytes signature (content-type: ${headerContentType || 'unknown'})`
    );
  }

  throw new Error(`Unexpected redirect handling state for URL: ${url}`);
}

export async function normalizeInlineImageBytes(file: {
  bytes: string;
  mimeType?: string;
}): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  const data = Uint8Array.from(Buffer.from(file.bytes, 'base64'));
  validateInlineImageSize(data);

  const sniffed = await fileTypeFromBuffer(data);
  const sniffedMime = sniffed?.mime?.toLowerCase();

  if (sniffedMime && ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(sniffedMime)) {
    return { data, mimeType: sniffedMime };
  }

  const providedMimeType = (file.mimeType || '').split(';')[0].trim().toLowerCase();
  if (providedMimeType === 'image/svg+xml' && looksLikeSvg(data)) {
    return { data, mimeType: 'image/svg+xml' };
  }

  ensureAllowedImageMimeType(providedMimeType || 'application/octet-stream');
  return {
    data,
    mimeType: providedMimeType,
  };
}

export function toCanonicalImageMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase();
}

function validateExternalImageUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid external image URL: ${rawUrl}`);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Blocked external image URL with unsupported scheme: ${protocol}`);
  }
  if (!ALLOWED_HTTP_PORTS.has(parsed.port)) {
    throw new Error(`Blocked external image URL with disallowed port: ${parsed.port}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Blocked external image URL with embedded credentials');
  }

  return parsed;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function validateUrlResolvesToPublicIp(url: URL): Promise<void> {
  const hostname = url.hostname;
  const candidateIps =
    isIP(hostname) === 0
      ? (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address)
      : [hostname];

  if (candidateIps.length === 0) {
    throw new Error(`No IP addresses resolved for host: ${hostname}`);
  }

  for (const ip of candidateIps) {
    if (isBlockedIpAddress(ip)) {
      logger.warn({ host: hostname, ip }, 'Blocked external image URL resolving to private IP');
      throw new Error(`Blocked external image URL resolving to private or reserved IP: ${ip}`);
    }
  }
}

function isBlockedIpAddress(ipAddress: string): boolean {
  if (ipaddr.IPv4.isValid(ipAddress)) {
    const parsed = ipaddr.IPv4.parse(ipAddress);
    const range = parsed.range();
    return (
      range === 'private' ||
      range === 'loopback' ||
      range === 'linkLocal' ||
      range === 'multicast' ||
      range === 'carrierGradeNat' ||
      range === 'reserved' ||
      range === 'unspecified' ||
      range === 'broadcast'
    );
  }

  if (ipaddr.IPv6.isValid(ipAddress)) {
    const parsed = ipaddr.IPv6.parse(ipAddress);
    const range = parsed.range();
    return (
      range === 'uniqueLocal' ||
      range === 'loopback' ||
      range === 'linkLocal' ||
      range === 'multicast' ||
      range === 'ipv4Mapped' ||
      range === 'rfc6145' ||
      range === 'rfc6052' ||
      range === '6to4' ||
      range === 'teredo' ||
      range === 'reserved' ||
      range === 'unspecified'
    );
  }

  return true;
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (!response.body) {
    throw new Error('External image response body is empty');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`Blocked external image exceeding ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function looksLikeSvg(data: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(data.subarray(0, 2048)).trimStart();
  return /^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(prefix);
}

function validateInlineImageSize(data: Uint8Array): void {
  if (data.length > MAX_EXTERNAL_IMAGE_BYTES) {
    throw new Error(`Blocked inline image exceeding ${MAX_EXTERNAL_IMAGE_BYTES} bytes`);
  }
}

function ensureAllowedImageMimeType(mimeType: string): void {
  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase();
  if (!normalizedMime || !ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Blocked image with unsupported mime type: ${mimeType || 'unknown'}`);
  }
}
