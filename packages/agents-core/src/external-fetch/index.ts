// Hardened external-file fetch primitives. Consumers outside the agents-api
// package (e.g. copilot-app's HelpScout fetcher) import from this subpath
// to reuse the same SSRF guard, redirect cap, size limit, and content-type
// validation that agents-api's blob-upload pipeline relies on.
//
// Internal helpers (e.g. the undici dispatcher lookup callback) are kept
// module-private and intentionally NOT re-exported here.

export { downloadExternalFile } from './external-file-downloader';
export {
  normalizeInlineFileBytes,
  normalizeInlineImageBytes,
  resolveDownloadedFileMimeType,
} from './file-content-security';
export {
  ALLOWED_EXTERNAL_IMAGE_MIME_TYPES,
  ALLOWED_HTTP_PORTS,
  type AllowedExternalImageMimeType,
  EXTERNAL_FETCH_TIMEOUT_MS,
  MAX_EXTERNAL_REDIRECTS,
  MAX_FILE_BYTES,
  TEXT_DOCUMENT_MAX_BYTES,
} from './file-security-constants';
export {
  BlockedConnectionToPrivateIpError,
  BlockedDisallowedPortError,
  BlockedEmbeddedCredentialsError,
  BlockedExternalFileExceedingError,
  BlockedExternalFileLargerThanError,
  BlockedExternalUnsupportedBytesError,
  BlockedInlineFileExceedingError,
  BlockedInlineUnsupportedFileBytesError,
  BlockedUnsupportedSchemeError,
  BlockedUrlResolvingToPrivateIpError,
  ExternalFileResponseBodyEmptyError,
  FailedToDownloadError,
  FileSecurityError,
  InvalidExternalFileUrlError,
  InvalidInlineFileMalformedBase64Error,
  InvalidUtf8TextDocumentError,
  isTransientDownloadError,
  NoIpResolvedError,
  PdfUrlIngestionError,
  RedirectMissingLocationError,
  TextDocumentAttachmentError,
  TextDocumentControlCharacterError,
  TimedOutDownloadingError,
  TooManyRedirectsError,
  UnableToResolveHostError,
  UnexpectedRedirectStateError,
  UnsupportedTextAttachmentSourceError,
} from './file-security-errors';
export {
  isBlockedIpAddress,
  makeSanitizedSourceUrl,
  validateExternalFileUrl,
  validateUrlResolvesToPublicIp,
} from './file-url-security';
