export class ImageSecurityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidExternalImageUrlError extends ImageSecurityError {
  constructor(rawUrl: string) {
    super(`Invalid external image URL: ${rawUrl}`);
  }
}

export class BlockedUnsupportedSchemeError extends ImageSecurityError {
  constructor(protocol: string) {
    super(`Blocked external image URL with unsupported scheme: ${protocol}`);
  }
}

export class BlockedDisallowedPortError extends ImageSecurityError {
  constructor(port: string) {
    super(`Blocked external image URL with disallowed port: ${port}`);
  }
}

export class BlockedEmbeddedCredentialsError extends ImageSecurityError {
  constructor() {
    super('Blocked external image URL with embedded credentials');
  }
}

export class NoIpResolvedError extends ImageSecurityError {
  constructor(hostname: string) {
    super(`No IP addresses resolved for host: ${hostname}`);
  }
}

export class BlockedUrlResolvingToPrivateIpError extends ImageSecurityError {
  constructor(ip: string) {
    super(`Blocked external image URL resolving to private or reserved IP: ${ip}`);
  }
}

export class UnableToResolveHostError extends ImageSecurityError {
  constructor(hostname: string, options?: ErrorOptions) {
    super(`Unable to resolve external image host: ${hostname}`, options);
  }
}

export class BlockedConnectionToPrivateIpError extends ImageSecurityError {
  constructor(address: string) {
    super(`Blocked external image connection to private or reserved IP: ${address}`);
  }
}

export class RedirectMissingLocationError extends ImageSecurityError {
  constructor(url: string) {
    super(`Redirect response missing location header: ${url}`);
  }
}

export class TooManyRedirectsError extends ImageSecurityError {
  constructor(url: string) {
    super(`Too many redirects while downloading image: ${url}`);
  }
}

export class FailedToDownloadError extends ImageSecurityError {
  constructor(url: string, statusText?: string, options?: ErrorOptions) {
    super(
      statusText
        ? `Failed to download image from ${url}: ${statusText}`
        : `Failed to download image from ${url}`,
      options
    );
  }
}

export class BlockedNonImageContentTypeError extends ImageSecurityError {
  constructor(contentType: string) {
    super(`Blocked external image with non-image content-type: ${contentType}`);
  }
}

export class BlockedExternalImageLargerThanError extends ImageSecurityError {
  constructor(maxBytes: number, contentLength: string) {
    super(`Blocked external image larger than ${maxBytes} bytes: ${contentLength}`);
  }
}

export class BlockedExternalImageExceedingError extends ImageSecurityError {
  constructor(maxBytes: number) {
    super(`Blocked external image exceeding ${maxBytes} bytes`);
  }
}

export class ExternalImageResponseBodyEmptyError extends ImageSecurityError {
  constructor() {
    super('External image response body is empty');
  }
}

export class UnexpectedRedirectStateError extends ImageSecurityError {
  constructor(url: string) {
    super(`Unexpected redirect handling state for URL: ${url}`);
  }
}

export class TimedOutDownloadingError extends ImageSecurityError {
  constructor(url: string) {
    super(`Timed out downloading image from ${url}`);
  }
}

export class BlockedInlineImageExceedingError extends ImageSecurityError {
  constructor(maxBytes: number) {
    super(`Blocked inline image exceeding ${maxBytes} bytes`);
  }
}

export class BlockedInlineUnsupportedBytesError extends ImageSecurityError {
  constructor(claimedContentType: string) {
    super(
      `Blocked inline image with unsupported bytes signature (claimed content-type: ${claimedContentType})`
    );
  }
}

export class BlockedExternalUnsupportedBytesError extends ImageSecurityError {
  constructor(contentType: string) {
    super(`Blocked external image with unsupported bytes signature (content-type: ${contentType})`);
  }
}

export class InvalidInlineImageMalformedBase64Error extends ImageSecurityError {
  constructor() {
    super('Invalid inline image: malformed base64 payload');
  }
}
