import { describe, expect, it } from 'vitest';
import {
  InvalidUtf8TextDocumentError,
  TextDocumentControlCharacterError,
} from '../../services/blob-storage/file-security-errors';
import {
  buildAttachedFileMarker,
  buildDecodedTextAttachmentBlock,
  buildTextAttachmentBlock,
  decodeTextDocumentBytes,
  getDefaultTextDocumentFilename,
} from '../text-document-attachments';

describe('text-document-attachments', () => {
  describe('decodeTextDocumentBytes', () => {
    it('normalizes CRLF line endings to LF', () => {
      const result = decodeTextDocumentBytes(
        Uint8Array.from(Buffer.from('line one\r\nline two\r', 'utf8'))
      );

      expect(result).toBe('line one\nline two\n');
    });

    it('throws InvalidUtf8TextDocumentError for invalid UTF-8 bytes', () => {
      const data = Uint8Array.from([0xc3, 0x28]);

      expect(() => decodeTextDocumentBytes(data)).toThrow(InvalidUtf8TextDocumentError);
    });

    it('throws TextDocumentControlCharacterError for disallowed control characters', () => {
      const data = Uint8Array.from(Buffer.from(`hello${String.fromCharCode(0)}world`, 'utf8'));

      expect(() => decodeTextDocumentBytes(data)).toThrow(TextDocumentControlCharacterError);
    });

    it('throws TextDocumentControlCharacterError for DEL character (0x7F)', () => {
      const data = Uint8Array.from(Buffer.from(`test${String.fromCharCode(0x7f)}data`, 'utf8'));

      expect(() => decodeTextDocumentBytes(data)).toThrow(TextDocumentControlCharacterError);
    });

    it('preserves allowed control characters (tab and newline)', () => {
      const result = decodeTextDocumentBytes(Buffer.from('col1\tcol2\nrow2', 'utf8'));

      expect(result).toBe('col1\tcol2\nrow2');
    });
  });

  describe('getDefaultTextDocumentFilename', () => {
    it.each([
      ['text/plain', 'unnamed.txt'],
      ['text/markdown', 'unnamed.md'],
      ['text/html', 'unnamed.html'],
      ['text/csv', 'unnamed.csv'],
      ['text/x-log', 'unnamed.log'],
      ['application/json', 'unnamed.json'],
      ['application/javascript', 'unnamed.js'],
      ['text/xml', 'unnamed.xml'],
      ['application/yaml', 'unnamed.yaml'],
    ])('returns correct default filename for %s', (mimeType, expected) => {
      expect(getDefaultTextDocumentFilename(mimeType)).toBe(expected);
    });
  });

  describe('buildTextAttachmentBlock', () => {
    it('uses provided filename', () => {
      const result = buildTextAttachmentBlock({
        mimeType: 'text/plain',
        content: 'hello',
        filename: 'notes.txt',
      });

      expect(result).toBe(
        '<attached_file filename="notes.txt" media_type="text/plain">\nhello\n</attached_file>'
      );
    });

    it('falls back to default filename when not provided', () => {
      const result = buildTextAttachmentBlock({ mimeType: 'text/markdown', content: '# Title' });

      expect(result).toContain('filename="unnamed.md"');
    });

    it('escapes filenames with quotes via JSON.stringify', () => {
      const result = buildTextAttachmentBlock({
        mimeType: 'text/plain',
        content: 'hello',
        filename: 'file"with"quotes.txt',
      });

      expect(result).toContain('filename="file\\"with\\"quotes.txt"');
    });
  });

  describe('buildDecodedTextAttachmentBlock', () => {
    it('decodes bytes and wraps in attached_file', () => {
      const result = buildDecodedTextAttachmentBlock({
        data: new TextEncoder().encode('hello world\n'),
        mimeType: 'text/markdown',
        filename: 'notes.md',
      });

      expect(result).toBe(
        '<attached_file filename="notes.md" media_type="text/markdown">\nhello world\n\n</attached_file>'
      );
    });

    it('matches the output of decode + buildTextAttachmentBlock composed manually', () => {
      const bytes = new TextEncoder().encode('Important Context:\nphone number: 123-456-7890\n');

      const viaHelper = buildDecodedTextAttachmentBlock({
        data: bytes,
        mimeType: 'text/plain',
        filename: 'context.txt',
      });
      const viaCompose = buildTextAttachmentBlock({
        mimeType: 'text/plain',
        content: decodeTextDocumentBytes(bytes),
        filename: 'context.txt',
      });

      expect(viaHelper).toBe(viaCompose);
    });

    it('throws InvalidUtf8TextDocumentError on invalid UTF-8', () => {
      expect(() =>
        buildDecodedTextAttachmentBlock({
          data: Uint8Array.from([0xc3, 0x28]),
          mimeType: 'text/plain',
          filename: 'bad.txt',
        })
      ).toThrow(InvalidUtf8TextDocumentError);
    });

    it('throws TextDocumentControlCharacterError on disallowed control characters', () => {
      expect(() =>
        buildDecodedTextAttachmentBlock({
          data: Uint8Array.from(Buffer.from(`before${String.fromCharCode(0x01)}after`, 'utf8')),
          mimeType: 'text/plain',
          filename: 'bad.txt',
        })
      ).toThrow(TextDocumentControlCharacterError);
    });
  });

  describe('buildAttachedFileMarker', () => {
    it('renders a self-closing marker with filename and media_type', () => {
      expect(buildAttachedFileMarker({ mimeType: 'image/png', filename: 'screenshot.png' })).toBe(
        '<attached_file filename="screenshot.png" media_type="image/png" />'
      );
    });

    it('normalizes the mimeType via normalizeMimeType', () => {
      expect(buildAttachedFileMarker({ mimeType: 'IMAGE/PNG', filename: 'a.png' })).toBe(
        '<attached_file filename="a.png" media_type="image/png" />'
      );
    });

    it('omits filename when not provided', () => {
      expect(buildAttachedFileMarker({ mimeType: 'application/pdf' })).toBe(
        '<attached_file media_type="application/pdf" />'
      );
    });

    it('omits media_type when mimeType is empty', () => {
      expect(buildAttachedFileMarker({ filename: 'unknown.bin' })).toBe(
        '<attached_file filename="unknown.bin" />'
      );
    });

    it('renders a bare marker when neither filename nor mimeType is provided', () => {
      expect(buildAttachedFileMarker({})).toBe('<attached_file />');
    });

    it('escapes filenames with quotes via JSON.stringify', () => {
      expect(
        buildAttachedFileMarker({
          mimeType: 'image/png',
          filename: 'name"with"quotes.png',
        })
      ).toBe('<attached_file filename="name\\"with\\"quotes.png" media_type="image/png" />');
    });

    it('includes artifact_id and tool_call_id so the model can fetch the attachment', () => {
      expect(
        buildAttachedFileMarker({
          mimeType: 'image/png',
          filename: 'photo.png',
          artifactId: 'attachment_msg_abc123',
          toolCallId: 'message_attachment:msg',
        })
      ).toBe(
        '<attached_file filename="photo.png" media_type="image/png" artifact_id="attachment_msg_abc123" tool_call_id="message_attachment:msg" />'
      );
    });

    it('omits artifact_id and tool_call_id attributes when not provided', () => {
      expect(buildAttachedFileMarker({ mimeType: 'image/png', filename: 'photo.png' })).toBe(
        '<attached_file filename="photo.png" media_type="image/png" />'
      );
    });
  });
});
