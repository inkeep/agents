export class FileSecurityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidExternalImageUrlError extends FileSecurityError {
  constructor(rawUrl: string) {
    super(`Invalid external image URL: ${rawUrl}`);
  }
}

export class BlockedUnsupportedSchemeError extends FileSecurityError {
  constructor(protocol: string) {
    super(`Blocked external image URL with unsupported scheme: ${protocol}`);
  }
}

export class BlockedDisallowedPortError extends FileSecurityError {
  constructor(port: string) {
    super(`Blocked external image URL with disallowed port: ${port}`);
  }
}

export class BlockedEmbeddedCredentialsError extends FileSecurityError {
  constructor() {
    super('Blocked external image URL with embedded credentials');
  }
}

export class NoIpResolvedError extends FileSecurityError {
  constructor(hostname: string) {
    super(`No IP addresses resolved for host: ${hostname}`);
  }
}

export class BlockedUrlResolvingToPrivateIpError extends FileSecurityError {
  constructor(ip: string) {
    super(`Blocked external image URL resolving to private or reserved IP: ${ip}`);
  }
}

export class UnableToResolveHostError extends FileSecurityError {
  constructor(hostname: string, options?: ErrorOptions) {
    super(`Unable to resolve external image host: ${hostname}`, options);
  }
}

export class BlockedConnectionToPrivateIpError extends FileSecurityError {
  constructor(address: string) {
    super(`Blocked external image connection to private or reserved IP: ${address}`);
  }
}

export class RedirectMissingLocationError extends FileSecurityError {
  constructor(url: string) {
    super(`Redirect response missing location header: ${url}`);
  }
}

export class TooManyRedirectsError extends FileSecurityError {
  constructor(url: string) {
    super(`Too many redirects while downloading image: ${url}`);
  }
}

export class FailedToDownloadError extends FileSecurityError {
  constructor(url: string, statusText?: string, options?: ErrorOptions) {
    super(
      statusText
        ? `Failed to download image from ${url}: ${statusText}`
        : `Failed to download image from ${url}`,
      options
    );
  }
}

export class BlockedExternalImageLargerThanError extends FileSecurityError {
  constructor(maxBytes: number, contentLength: string) {
    super(`Blocked external image larger than ${maxBytes} bytes: ${contentLength}`);
  }
}

export class BlockedExternalImageExceedingError extends FileSecurityError {
  constructor(maxBytes: number) {
    super(`Blocked external image exceeding ${maxBytes} bytes`);
  }
}

export class ExternalImageResponseBodyEmptyError extends FileSecurityError {
  constructor() {
    super('External image response body is empty');
  }
}

export class UnexpectedRedirectStateError extends FileSecurityError {
  constructor(url: string) {
    super(`Unexpected redirect handling state for URL: ${url}`);
  }
}

export class TimedOutDownloadingError extends FileSecurityError {
  constructor(url: string) {
    super(`Timed out downloading image from ${url}`);
  }
}

export class BlockedInlineFileExceedingError extends FileSecurityError {
  constructor(maxBytes: number) {
    super(`Blocked inline file exceeding ${maxBytes} bytes`);
  }
}

export class BlockedInlineUnsupportedFileBytesError extends FileSecurityError {
  constructor(claimedContentType: string) {
    super(
      `Blocked inline file with unsupported bytes signature (claimed content-type: ${claimedContentType})`
    );
  }
}

export class BlockedExternalUnsupportedBytesError extends FileSecurityError {
  constructor(contentType: string) {
    super(`Blocked external image with unsupported bytes signature (content-type: ${contentType})`);
  }
}

export class InvalidInlineFileMalformedBase64Error extends FileSecurityError {
  constructor() {
    super('Invalid inline file: malformed base64 payload');
  }
}
