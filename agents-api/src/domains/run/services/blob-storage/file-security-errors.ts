export class FileSecurityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidExternalFileUrlError extends FileSecurityError {
  constructor(rawUrl: string) {
    super(`Invalid external file URL: ${rawUrl}`);
  }
}

export class BlockedUnsupportedSchemeError extends FileSecurityError {
  constructor(protocol: string) {
    super(`Blocked external file URL with unsupported scheme: ${protocol}`);
  }
}

export class BlockedDisallowedPortError extends FileSecurityError {
  constructor(port: string) {
    super(`Blocked external file URL with disallowed port: ${port}`);
  }
}

export class BlockedEmbeddedCredentialsError extends FileSecurityError {
  constructor() {
    super('Blocked external file URL with embedded credentials');
  }
}

export class NoIpResolvedError extends FileSecurityError {
  constructor(hostname: string) {
    super(`No IP addresses resolved for host: ${hostname}`);
  }
}

export class BlockedUrlResolvingToPrivateIpError extends FileSecurityError {
  constructor(ip: string) {
    super(`Blocked external file URL resolving to private or reserved IP: ${ip}`);
  }
}

export class UnableToResolveHostError extends FileSecurityError {
  constructor(hostname: string, options?: ErrorOptions) {
    super(`Unable to resolve external file host: ${hostname}`, options);
  }
}

export class BlockedConnectionToPrivateIpError extends FileSecurityError {
  constructor(address: string) {
    super(`Blocked external file connection to private or reserved IP: ${address}`);
  }
}

export class RedirectMissingLocationError extends FileSecurityError {
  constructor(url: string) {
    super(`Redirect response missing location header: ${url}`);
  }
}

export class TooManyRedirectsError extends FileSecurityError {
  constructor(url: string) {
    super(`Too many redirects while downloading file: ${url}`);
  }
}

export class FailedToDownloadError extends FileSecurityError {
  constructor(url: string, statusText?: string, options?: ErrorOptions) {
    super(
      statusText
        ? `Failed to download file from ${url}: ${statusText}`
        : `Failed to download file from ${url}`,
      options
    );
  }
}

export class BlockedExternalFileLargerThanError extends FileSecurityError {
  constructor(maxBytes: number, contentLength: string) {
    super(`Blocked external file larger than ${maxBytes} bytes: ${contentLength}`);
  }
}

export class BlockedExternalFileExceedingError extends FileSecurityError {
  constructor(maxBytes: number) {
    super(`Blocked external file exceeding ${maxBytes} bytes`);
  }
}

export class ExternalFileResponseBodyEmptyError extends FileSecurityError {
  constructor() {
    super('External file response body is empty');
  }
}

export class UnexpectedRedirectStateError extends FileSecurityError {
  constructor(url: string) {
    super(`Unexpected redirect handling state for URL: ${url}`);
  }
}

export class TimedOutDownloadingError extends FileSecurityError {
  constructor(url: string) {
    super(`Timed out downloading file from ${url}`);
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
    super(`Blocked external file with unsupported bytes signature (content-type: ${contentType})`);
  }
}

export class InvalidInlineFileMalformedBase64Error extends FileSecurityError {
  constructor() {
    super('Invalid inline file: malformed base64 payload');
  }
}

export class TextDocumentAttachmentError extends FileSecurityError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidUtf8TextDocumentError extends TextDocumentAttachmentError {
  constructor(options?: ErrorOptions) {
    super('Invalid UTF-8 text document', options);
  }
}

export class TextDocumentControlCharacterError extends TextDocumentAttachmentError {
  constructor(options?: ErrorOptions) {
    super('Text document contains disallowed control characters', options);
  }
}

export class UnsupportedTextAttachmentSourceError extends TextDocumentAttachmentError {
  constructor(mimeType: string, options?: ErrorOptions) {
    super(`Unsupported text attachment source for mime type: ${mimeType}`, options);
  }
}

export class UnsupportedFileTypeForModelError extends Error {
  readonly mimeType: string;
  readonly modelId: string;

  constructor(mimeType: string, modelId: string) {
    super(
      `File type "${mimeType}" is not supported by the configured model "${modelId}". Use an OpenAI or Gemini model to attach Word or Excel files.`
    );
    this.name = 'UnsupportedFileTypeForModelError';
    this.mimeType = mimeType;
    this.modelId = modelId;
  }
}

export class PdfUrlIngestionError extends FileSecurityError {
  readonly sourceUrl: string;

  constructor(sourceUrl: string, options?: ErrorOptions) {
    super(`Failed to ingest PDF URL: ${sourceUrl}`, options);
    this.sourceUrl = sourceUrl;
  }
}
