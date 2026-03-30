import {
  ALLOWED_TEXT_DOCUMENT_MIME_TYPES,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';
import {
  InvalidUtf8TextDocumentError,
  TextDocumentControlCharacterError,
} from '../services/blob-storage/file-security-errors';

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

export function isTextDocumentMimeType(mimeType: string | undefined): mimeType is string {
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
    case 'application/json':
      return 'unnamed.json';
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
