import {
  ALLOWED_TEXT_DOCUMENT_MIME_TYPES,
  getExtensionFromMimeType,
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
  const extension = getExtensionFromMimeType(normalizeMimeType(mimeType));
  return `unnamed.${extension === 'bin' ? 'txt' : extension}`;
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

export function buildDecodedTextAttachmentBlock(params: {
  data: Uint8Array;
  mimeType: string;
  filename?: string;
}): string {
  const content = decodeTextDocumentBytes(params.data);
  return buildTextAttachmentBlock({
    mimeType: params.mimeType,
    content,
    filename: params.filename,
  });
}

export const UNAVAILABLE_ATTACHMENT_PLACEHOLDER = '[Attachment unavailable]';

/**
 * Convenience wrapper around `buildTextAttachmentBlock` for the failure path —
 * produces an `<attached_file>...[Attachment unavailable]...</attached_file>` block
 * so the model still sees that an attachment existed even when its bytes are lost.
 */
export function buildUnavailableTextAttachmentBlock(params: {
  mimeType: string;
  filename?: string;
}): string {
  return buildTextAttachmentBlock({
    mimeType: params.mimeType,
    content: UNAVAILABLE_ATTACHMENT_PLACEHOLDER,
    filename: params.filename,
  });
}

/**
 * Self-closing `<attached_file ... />` marker used when the attachment's content is not
 * (or can no longer be) inlined — e.g. images/PDFs in conversation history, or a text
 * attachment whose bytes failed to decode. The marker preserves provenance for the model
 * so prior attachments don't silently disappear on resume. When `artifactId` and
 * `toolCallId` are provided, the marker is self-describing enough for the model (or
 * downstream tools) to fetch the attachment from the artifact ledger.
 */
export function buildAttachedFileMarker(params: {
  mimeType?: string;
  filename?: string;
  artifactId?: string;
  toolCallId?: string;
}): string {
  const mimeType = params.mimeType ? normalizeMimeType(params.mimeType) : '';
  const filename = params.filename?.trim() || undefined;
  const artifactId = params.artifactId?.trim() || undefined;
  const toolCallId = params.toolCallId?.trim() || undefined;
  const attrs: string[] = [];
  if (filename) attrs.push(`filename=${JSON.stringify(filename)}`);
  if (mimeType) attrs.push(`media_type=${JSON.stringify(mimeType)}`);
  if (artifactId) attrs.push(`artifact_id=${JSON.stringify(artifactId)}`);
  if (toolCallId) attrs.push(`tool_call_id=${JSON.stringify(toolCallId)}`);
  return `<attached_file${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''} />`;
}
