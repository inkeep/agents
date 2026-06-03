import { describe, expect, it } from 'vitest';
import {
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
  TextDocumentControlCharacterError,
  TimedOutDownloadingError,
  TooManyRedirectsError,
  UnableToResolveHostError,
  UnexpectedRedirectStateError,
  UnsupportedTextAttachmentSourceError,
} from '../file-security-errors';

describe('isTransientDownloadError', () => {
  it.each([
    ['FailedToDownloadError', new FailedToDownloadError('https://example.com/img.png', '404')],
    ['TimedOutDownloadingError', new TimedOutDownloadingError('https://example.com/img.png')],
    ['UnableToResolveHostError', new UnableToResolveHostError('bad-host.invalid')],
    ['NoIpResolvedError', new NoIpResolvedError('no-ip.example')],
    ['ExternalFileResponseBodyEmptyError', new ExternalFileResponseBodyEmptyError()],
    ['BlockedExternalUnsupportedBytesError', new BlockedExternalUnsupportedBytesError('image/gif')],
  ])('returns true for transient error: %s', (_name, error) => {
    expect(isTransientDownloadError(error)).toBe(true);
  });

  it.each([
    ['BlockedUrlResolvingToPrivateIpError', new BlockedUrlResolvingToPrivateIpError('127.0.0.1')],
    ['BlockedConnectionToPrivateIpError', new BlockedConnectionToPrivateIpError('10.0.0.1')],
    ['BlockedEmbeddedCredentialsError', new BlockedEmbeddedCredentialsError()],
    ['BlockedUnsupportedSchemeError', new BlockedUnsupportedSchemeError('ftp:')],
    ['BlockedDisallowedPortError', new BlockedDisallowedPortError('8080')],
    ['InvalidExternalFileUrlError', new InvalidExternalFileUrlError('not-a-url')],
    ['RedirectMissingLocationError', new RedirectMissingLocationError('https://example.com')],
    ['TooManyRedirectsError', new TooManyRedirectsError('https://example.com')],
    ['UnexpectedRedirectStateError', new UnexpectedRedirectStateError('https://example.com')],
    ['BlockedExternalFileExceedingError', new BlockedExternalFileExceedingError(10_000_000)],
    [
      'BlockedExternalFileLargerThanError',
      new BlockedExternalFileLargerThanError(10_000_000, '50000000'),
    ],
    ['BlockedInlineFileExceedingError', new BlockedInlineFileExceedingError(10_000_000)],
    [
      'BlockedInlineUnsupportedFileBytesError',
      new BlockedInlineUnsupportedFileBytesError('image/gif'),
    ],
    ['base FileSecurityError', new FileSecurityError('generic')],
    ['PdfUrlIngestionError', new PdfUrlIngestionError('https://example.com/doc.pdf')],
    ['InvalidInlineFileMalformedBase64Error', new InvalidInlineFileMalformedBase64Error()],
    ['InvalidUtf8TextDocumentError', new InvalidUtf8TextDocumentError()],
    ['TextDocumentControlCharacterError', new TextDocumentControlCharacterError()],
    [
      'UnsupportedTextAttachmentSourceError',
      new UnsupportedTextAttachmentSourceError('text/x-unknown'),
    ],
  ])('returns false for non-transient error: %s', (_name, error) => {
    expect(isTransientDownloadError(error)).toBe(false);
  });

  it('returns false for a plain Error', () => {
    expect(isTransientDownloadError(new Error('something'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientDownloadError(null)).toBe(false);
    expect(isTransientDownloadError(undefined)).toBe(false);
    expect(isTransientDownloadError('string')).toBe(false);
  });
});
