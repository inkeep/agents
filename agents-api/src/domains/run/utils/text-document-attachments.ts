import {
  ALLOWED_TEXT_DOCUMENT_MIME_TYPES,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';

export const TEXT_DOCUMENT_MAX_BYTES = 256 * 1024;

function isDisallowedTextControlCharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0x0 && codePoint <= 0x8) ||
    codePoint === 0xb ||
    codePoint === 0xc ||
    (codePoint >= 0xe && codePoint <= 0x1f) ||
    codePoint === 0x7f
  );
}

function hasDisallowedControlCharacters(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || isDisallowedTextControlCharacter(codePoint)) {
      return true;
    }
  }

  return false;
}

export class TextDocumentAttachmentError extends Error {
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

export function isTextDocumentMimeType(mimeType: string | undefined): boolean {
  return ALLOWED_TEXT_DOCUMENT_MIME_TYPES.has(normalizeMimeType(mimeType ?? ''));
}

export function getDefaultTextDocumentFilename(mimeType: string): string {
  switch (normalizeMimeType(mimeType)) {
    case 'text/markdown':
      return 'unnamed.md';
    case 'text/html':
      return 'unnamed.html';
    case 'text/csv':
      return 'unnamed.csv';
    case 'text/x-log':
      return 'unnamed.log';
    default:
      return 'unnamed.txt';
  }
}

export function decodeTextDocumentBytes(data: Uint8Array): string {
  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new InvalidUtf8TextDocumentError();
  }

  if (hasDisallowedControlCharacters(decoded)) {
    throw new TextDocumentControlCharacterError();
  }

  return decoded.replace(/\r\n?/g, '\n');
}

export function buildTextAttachmentBlock(params: {
  mimeType: string;
  content: string;
  filename?: string;
}): string {
  const mimeType = normalizeMimeType(params.mimeType);
  const filename = params.filename?.trim() || getDefaultTextDocumentFilename(mimeType);

  return [
    `<attached_file filename=${JSON.stringify(filename)} media_type=${JSON.stringify(mimeType)}>`,
    params.content,
    '</attached_file>',
  ].join('\n');
}
