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
import { resolveDownloadedImageMimeType } from './image-content-security';
import {
  ALLOWED_EXTERNAL_IMAGE_MIME_TYPES,
  EXTERNAL_FETCH_TIMEOUT_MS,
  MAX_EXTERNAL_IMAGE_BYTES,
  MAX_EXTERNAL_REDIRECTS,
} from './image-security-constants';
import { validateExternalImageUrl, validateUrlResolvesToPublicIp } from './image-url-security';

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
    const mimeType = await resolveDownloadedImageMimeType(data, headerContentType);
    return { data, mimeType };
  }

  throw new Error(`Unexpected redirect handling state for URL: ${url}`);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
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
