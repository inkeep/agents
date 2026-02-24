/**
 * Downloads an image from a user-provided URL with checks that plain fetch() does not provide.
 *
 * Why this exists:
 * - Blocks requests to private/internal addresses, including redirect targets.
 * - Enforces strict size limits so very large files cannot exhaust server memory.
 * - Requires bytes to match an allowed image format instead of trusting headers alone.
 *
 * Use this for any untrusted external image URL.
 */
import { lookup as dnsLookup } from 'node:dns';
import { Agent } from 'undici';
import { resolveDownloadedImageMimeType } from './image-content-security';
import {
  ALLOWED_EXTERNAL_IMAGE_MIME_TYPES,
  EXTERNAL_FETCH_TIMEOUT_MS,
  MAX_EXTERNAL_IMAGE_BYTES,
  MAX_EXTERNAL_REDIRECTS,
} from './image-security-constants';
import {
  BLOCKED_CONNECTION_PRIVATE_PREFIX,
  blockedConnectionToPrivateIp,
  blockedExternalImageExceeding,
  blockedExternalImageLargerThan,
  blockedNonImageContentType,
  externalImageResponseBodyEmpty,
  failedToDownload,
  redirectMissingLocation,
  timedOutDownloading,
  tooManyRedirects,
  UNABLE_RESOLVE_HOST_PREFIX,
  unableToResolveHost,
  unexpectedRedirectState,
} from './image-security-errors';
import {
  isBlockedIpAddress,
  validateExternalImageUrl,
  validateUrlResolvesToPublicIp,
} from './image-url-security';

const externalImageDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, options, (error, address, family) => {
        if (error) {
          callback(new Error(unableToResolveHost(hostname)), '', 0);
          return;
        }

        if (Array.isArray(address)) {
          const selected = address[0];
          if (!selected) {
            callback(new Error(unableToResolveHost(hostname)), '', 0);
            return;
          }

          if (isBlockedIpAddress(selected.address)) {
            callback(new Error(blockedConnectionToPrivateIp(selected.address)), '', 0);
            return;
          }

          callback(null, selected.address, selected.family);
          return;
        }

        if (isBlockedIpAddress(address)) {
          callback(new Error(blockedConnectionToPrivateIp(address)), '', 0);
          return;
        }

        callback(null, address, family);
      });
    },
  },
});

export async function downloadExternalImage(
  url: string
): Promise<{ data: Uint8Array; mimeType: string }> {
  let currentUrl = validateExternalImageUrl(url);
  await validateUrlResolvesToPublicIp(currentUrl);

  for (let redirectCount = 0; redirectCount <= MAX_EXTERNAL_REDIRECTS; redirectCount++) {
    const response = await fetchWithConnectionIpValidation(currentUrl);

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(redirectMissingLocation(toSanitizedUrl(currentUrl)));
      }

      if (redirectCount === MAX_EXTERNAL_REDIRECTS) {
        throw new Error(tooManyRedirects(toSanitizedUrl(url)));
      }

      currentUrl = validateExternalImageUrl(new URL(location, currentUrl).toString());
      await validateUrlResolvesToPublicIp(currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        failedToDownload(toSanitizedUrl(currentUrl), `${response.status} ${response.statusText}`)
      );
    }

    const headerContentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (headerContentType && !ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(headerContentType)) {
      throw new Error(blockedNonImageContentType(headerContentType));
    }

    const contentLength = response.headers.get('content-length');
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > MAX_EXTERNAL_IMAGE_BYTES
    ) {
      throw new Error(blockedExternalImageLargerThan(MAX_EXTERNAL_IMAGE_BYTES, contentLength));
    }

    const data = await readResponseBytesWithLimit(response, MAX_EXTERNAL_IMAGE_BYTES);
    const mimeType = await resolveDownloadedImageMimeType(data, headerContentType);
    return { data, mimeType };
  }

  throw new Error(unexpectedRedirectState(toSanitizedUrl(url)));
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (!response.body) {
    throw new Error(externalImageResponseBodyEmpty);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
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
        throw new Error(blockedExternalImageExceeding(maxBytes));
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function fetchWithConnectionIpValidation(url: URL): Promise<Response> {
  try {
    return await fetch(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
      dispatcher: externalImageDispatcher,
    } as RequestInit & { dispatcher: Agent });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.startsWith(BLOCKED_CONNECTION_PRIVATE_PREFIX) ||
        error.message.startsWith(UNABLE_RESOLVE_HOST_PREFIX)
      ) {
        throw error;
      }
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error(timedOutDownloading(toSanitizedUrl(url)));
      }
    }

    throw new Error(failedToDownload(toSanitizedUrl(url)));
  }
}

// Remove search and hash from the URL for logging purposes
function toSanitizedUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? new URL(url) : new URL(url.toString());
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
