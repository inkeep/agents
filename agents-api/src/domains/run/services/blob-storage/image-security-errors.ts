/**
 * Centralized error messages for image security (URL validation, download, content checks).
 * Use these so messages stay in sync and rethrow checks match thrown messages.
 */

export const BLOCKED_CONNECTION_PRIVATE_PREFIX =
  'Blocked external image connection to private or reserved IP';
export const UNABLE_RESOLVE_HOST_PREFIX = 'Unable to resolve external image host:';

export function invalidExternalImageUrl(rawUrl: string): string {
  return `Invalid external image URL: ${rawUrl}`;
}

export function blockedUnsupportedScheme(protocol: string): string {
  return `Blocked external image URL with unsupported scheme: ${protocol}`;
}

export function blockedDisallowedPort(port: string): string {
  return `Blocked external image URL with disallowed port: ${port}`;
}

export const blockedEmbeddedCredentials = 'Blocked external image URL with embedded credentials';

export function noIpResolved(hostname: string): string {
  return `No IP addresses resolved for host: ${hostname}`;
}

export function blockedUrlResolvingToPrivateIp(ip: string): string {
  return `Blocked external image URL resolving to private or reserved IP: ${ip}`;
}

export function unableToResolveHost(hostname: string): string {
  return `${UNABLE_RESOLVE_HOST_PREFIX} ${hostname}`;
}

export function blockedConnectionToPrivateIp(address: string): string {
  return `${BLOCKED_CONNECTION_PRIVATE_PREFIX}: ${address}`;
}

export function redirectMissingLocation(url: string): string {
  return `Redirect response missing location header: ${url}`;
}

export function tooManyRedirects(url: string): string {
  return `Too many redirects while downloading image: ${url}`;
}

export function failedToDownload(url: string, statusText?: string): string {
  return statusText
    ? `Failed to download image from ${url}: ${statusText}`
    : `Failed to download image from ${url}`;
}

export function blockedNonImageContentType(contentType: string): string {
  return `Blocked external image with non-image content-type: ${contentType}`;
}

export function blockedExternalImageLargerThan(maxBytes: number, contentLength: string): string {
  return `Blocked external image larger than ${maxBytes} bytes: ${contentLength}`;
}

export function blockedExternalImageExceeding(maxBytes: number): string {
  return `Blocked external image exceeding ${maxBytes} bytes`;
}

export const externalImageResponseBodyEmpty = 'External image response body is empty';

export function unexpectedRedirectState(url: string): string {
  return `Unexpected redirect handling state for URL: ${url}`;
}

export function timedOutDownloading(url: string): string {
  return `Timed out downloading image from ${url}`;
}

export function blockedInlineImageExceeding(maxBytes: number): string {
  return `Blocked inline image exceeding ${maxBytes} bytes`;
}

export function blockedInlineUnsupportedBytes(claimedContentType: string): string {
  return `Blocked inline image with unsupported bytes signature (claimed content-type: ${claimedContentType})`;
}

export function blockedExternalUnsupportedBytes(contentType: string): string {
  return `Blocked external image with unsupported bytes signature (content-type: ${contentType})`;
}

export const invalidInlineImageMalformedBase64 = 'Invalid inline image: malformed base64 payload';
