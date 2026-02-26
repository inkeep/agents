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
  BlockedConnectionToPrivateIpError,
  BlockedExternalImageExceedingError,
  BlockedExternalImageLargerThanError,
  BlockedNonImageContentTypeError,
  ExternalImageResponseBodyEmptyError,
  FailedToDownloadError,
  ImageSecurityError,
  RedirectMissingLocationError,
  TimedOutDownloadingError,
  TooManyRedirectsError,
  UnableToResolveHostError,
  UnexpectedRedirectStateError,
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
          callback(new UnableToResolveHostError(hostname, { cause: error }), '', 0);
          return;
        }

        if (Array.isArray(address)) {
          const selected = address[0];
          if (!selected) {
            callback(new UnableToResolveHostError(hostname), '', 0);
            return;
          }

          if (isBlockedIpAddress(selected.address)) {
            callback(new BlockedConnectionToPrivateIpError(selected.address), '', 0);
            return;
          }

          callback(null, selected.address, selected.family);
          return;
        }

        if (isBlockedIpAddress(address)) {
          callback(new BlockedConnectionToPrivateIpError(address), '', 0);
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
        throw new RedirectMissingLocationError(toSanitizedUrl(currentUrl));
      }

      if (redirectCount === MAX_EXTERNAL_REDIRECTS) {
        throw new TooManyRedirectsError(toSanitizedUrl(url));
      }

      currentUrl = validateExternalImageUrl(new URL(location, currentUrl).toString());
      await validateUrlResolvesToPublicIp(currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new FailedToDownloadError(
        toSanitizedUrl(currentUrl),
        `${response.status} ${response.statusText}`
      );
    }

    const headerContentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (headerContentType && !ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(headerContentType)) {
      throw new BlockedNonImageContentTypeError(headerContentType);
    }

    const contentLength = response.headers.get('content-length');
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > MAX_EXTERNAL_IMAGE_BYTES
    ) {
      throw new BlockedExternalImageLargerThanError(MAX_EXTERNAL_IMAGE_BYTES, contentLength);
    }

    const data = await readResponseBytesWithLimit(response, MAX_EXTERNAL_IMAGE_BYTES);
    const mimeType = await resolveDownloadedImageMimeType(data, headerContentType);
    return { data, mimeType };
  }

  throw new UnexpectedRedirectStateError(toSanitizedUrl(url));
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (!response.body) {
    throw new ExternalImageResponseBodyEmptyError();
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
        throw new BlockedExternalImageExceedingError(maxBytes);
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
    const imageSecurityError = extractImageSecurityError(error);
    if (
      imageSecurityError instanceof BlockedConnectionToPrivateIpError ||
      imageSecurityError instanceof UnableToResolveHostError
    ) {
      throw imageSecurityError;
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new TimedOutDownloadingError(toSanitizedUrl(url));
    }

    throw new FailedToDownloadError(toSanitizedUrl(url), undefined, { cause: error });
  }
}

function extractImageSecurityError(error: unknown): ImageSecurityError | null {
  if (error instanceof ImageSecurityError) {
    return error;
  }

  if (error instanceof Error && error.cause) {
    return extractImageSecurityError(error.cause);
  }

  return null;
}

// Remove search and hash from the URL for logging purposes
function toSanitizedUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? new URL(url) : new URL(url.toString());
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
