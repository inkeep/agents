import { describe, expect, it } from 'vitest';
import {
  InvalidUtf8TextDocumentError,
  TextDocumentControlCharacterError,
} from '../../services/blob-storage/file-security-errors';
import { decodeTextDocumentBytes } from '../text-document-attachments';

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
  });
});
