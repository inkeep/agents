import { describe, expect, it } from 'vitest';
import {
  InvalidUtf8TextDocumentError,
  TextDocumentControlCharacterError,
} from '../../services/blob-storage/file-security-errors';
import {
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
});
