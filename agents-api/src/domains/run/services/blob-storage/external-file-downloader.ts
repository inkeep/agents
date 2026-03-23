import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns';
import { retryWithBackoff } from '@inkeep/agents-core';
import { Agent } from 'undici';
import { resolveDownloadedFileMimeType } from './file-content-security';
import {
  EXTERNAL_FETCH_TIMEOUT_MS,
  MAX_EXTERNAL_REDIRECTS,
  MAX_FILE_BYTES,
} from './file-security-constants';
import {
  BlockedConnectionToPrivateIpError,
  BlockedExternalFileExceedingError,
  BlockedExternalFileLargerThanError,
  ExternalFileResponseBodyEmptyError,
  FailedToDownloadError,
  FileSecurityError,
  RedirectMissingLocationError,
  TimedOutDownloadingError,
  TooManyRedirectsError,
  UnableToResolveHostError,
  UnexpectedRedirectStateError,
} from './file-security-errors';
import {
  isBlockedIpAddress,
  validateExternalFileUrl,
  validateUrlResolvesToPublicIp,
} from './file-url-security';

const externalImageDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, options, (error, address, family) => {
        if (error) {
          callback(new UnableToResolveHostError(hostname, { cause: error }), '', 0);
          return;
        }

        forwardLookupResult(hostname, address, family, callback);
      });
    },
  },
});

const MAX_EXTERNAL_FETCH_ATTEMPTS = 3;

type LookupCallback = (
  error: Error | null,
  address: string | LookupAddress[],
  family?: number
) => void;

export function forwardLookupResult(
  hostname: string,
  address: string | LookupAddress[],
  family: number | undefined,
  callback: LookupCallback
): void {
  if (Array.isArray(address)) {
    const selected = address[0];
    if (!selected) {
      callback(new UnableToResolveHostError(hostname), '', 0);
      return;
    }

    const blocked = address.find((candidate) => isBlockedIpAddress(candidate.address));
    if (blocked) {
      callback(new BlockedConnectionToPrivateIpError(blocked.address), '', 0);
      return;
    }

    callback(null, address);
    return;
  }

  if (isBlockedIpAddress(address)) {
    callback(new BlockedConnectionToPrivateIpError(address), '', 0);
    return;
  }

  callback(null, address, family);
}

export async function downloadExternalFile(
  url: string,
  options?: { expectedMimeType?: string }
): Promise<{ data: Uint8Array; mimeType: string }> {
  let currentUrl = validateExternalFileUrl(url);
  await validateUrlResolvesToPublicIp(currentUrl);

  for (let redirectCount = 0; redirectCount <= MAX_EXTERNAL_REDIRECTS; redirectCount++) {
    const response = await fetchWithRetry(currentUrl);

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new RedirectMissingLocationError(toSanitizedUrl(currentUrl));
      }

      if (redirectCount === MAX_EXTERNAL_REDIRECTS) {
        throw new TooManyRedirectsError(toSanitizedUrl(url));
      }

      currentUrl = validateExternalFileUrl(new URL(location, currentUrl).toString());
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

    const contentLength = response.headers.get('content-length');
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > MAX_FILE_BYTES
    ) {
      throw new BlockedExternalFileLargerThanError(MAX_FILE_BYTES, contentLength);
    }

    const data = await readResponseBytesWithLimit(response, MAX_FILE_BYTES);
    const mimeType = await resolveDownloadedFileMimeType(
      data,
      headerContentType,
      options?.expectedMimeType
    );
    return { data, mimeType };
  }

  throw new UnexpectedRedirectStateError(toSanitizedUrl(url));
}

async function fetchWithRetry(url: URL): Promise<Response> {
  return retryWithBackoff(
    async () => {
      let response: Response;
      try {
        response = await fetchWithConnectionIpValidation(url);
      } catch (error) {
        if (error instanceof TimedOutDownloadingError || error instanceof FailedToDownloadError) {
          (error as unknown as { status: number }).status = 502;
        }
        throw error;
      }
      if (isRetryableStatus(response.status)) {
        const err = new FailedToDownloadError(
          toSanitizedUrl(url),
          `${response.status} ${response.statusText}`
        );
        (err as unknown as { status: number }).status = response.status;
        throw err;
      }
      return response;
    },
    {
      maxAttempts: MAX_EXTERNAL_FETCH_ATTEMPTS,
      maxDelayMs: 2_000,
      label: `file-download ${toSanitizedUrl(url)}`,
    }
  );
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (!response.body) {
    throw new ExternalFileResponseBodyEmptyError();
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
        throw new BlockedExternalFileExceedingError(maxBytes);
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
    const fileSecurityError = extractFileSecurityError(error);
    if (
      fileSecurityError instanceof BlockedConnectionToPrivateIpError ||
      fileSecurityError instanceof UnableToResolveHostError
    ) {
      throw fileSecurityError;
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new TimedOutDownloadingError(toSanitizedUrl(url));
    }

    throw new FailedToDownloadError(toSanitizedUrl(url), undefined, { cause: error });
  }
}

function extractFileSecurityError(error: unknown): FileSecurityError | null {
  if (error instanceof FileSecurityError) {
    return error;
  }

  if (error instanceof Error && error.cause) {
    return extractFileSecurityError(error.cause);
  }

  return null;
}

function toSanitizedUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? new URL(url) : new URL(url.toString());
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
