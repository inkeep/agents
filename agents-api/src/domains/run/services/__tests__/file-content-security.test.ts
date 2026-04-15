import { describe, expect, it } from 'vitest';
import {
  normalizeInlineFileBytes,
  normalizeInlineImageBytes,
  resolveDownloadedFileMimeType,
} from '../blob-storage/file-content-security';
import { MAX_FILE_BYTES, TEXT_DOCUMENT_MAX_BYTES } from '../blob-storage/file-security-constants';
import {
  BlockedInlineFileExceedingError,
  BlockedInlineUnsupportedFileBytesError,
} from '../blob-storage/file-security-errors';

const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);

const VALID_PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');

describe('file-content-security', () => {
  describe('normalizeInlineImageBytes', () => {
    it('accepts valid PNG base64 and returns sniffed mime', async () => {
      const result = await normalizeInlineImageBytes({
        bytes: VALID_PNG_BYTES.toString('base64'),
        mimeType: 'image/jpeg',
      });
      expect(result.mimeType).toBe('image/png');
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(VALID_PNG_BYTES.length);
    });

    it('rejects SVG', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      await expect(
        normalizeInlineImageBytes({
          bytes: Buffer.from(svg).toString('base64'),
          mimeType: 'image/svg+xml',
        })
      ).rejects.toThrow(/Blocked inline file with unsupported bytes signature/);
    });

    it('rejects oversized inline bytes', async () => {
      const large = Buffer.alloc(MAX_FILE_BYTES + 1, 1).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: large, mimeType: 'image/png' })
      ).rejects.toThrow(/Blocked inline file exceeding/);
    });

    it('rejects disallowed mime when bytes do not sniff as image', async () => {
      const random = Buffer.alloc(64, 0x01).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: random, mimeType: 'application/octet-stream' })
      ).rejects.toThrow(/Blocked inline file with unsupported bytes signature/);
    });

    it('rejects malformed base64 payload', async () => {
      await expect(
        normalizeInlineImageBytes({ bytes: '!!!not-base64!!!', mimeType: 'image/png' })
      ).rejects.toThrow(/Invalid inline file: malformed base64 payload/);
    });

    it('rejects random bytes even when claimed mime type is allowed', async () => {
      const random = Buffer.alloc(128, 0x7f).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: random, mimeType: 'image/png' })
      ).rejects.toThrow(/Blocked inline file with unsupported bytes signature/);
    });

    it('rejects non-image content that claims PDF', async () => {
      await expect(
        normalizeInlineImageBytes({
          bytes: VALID_PDF_BYTES.toString('base64'),
          mimeType: 'application/pdf',
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });
  });

  describe('normalizeInlineFileBytes', () => {
    it('accepts valid inline PDF data when mimeType claims application/pdf', async () => {
      const result = await normalizeInlineFileBytes({
        bytes: VALID_PDF_BYTES.toString('base64'),
        mimeType: 'application/pdf',
      });

      expect(result.mimeType).toBe('application/pdf');
      expect(Buffer.from(result.data).subarray(0, 5).toString('utf8')).toBe('%PDF-');
    });

    it('rejects non-PDF bytes that claim application/pdf', async () => {
      await expect(
        normalizeInlineFileBytes({
          bytes: VALID_PNG_BYTES.toString('base64'),
          mimeType: 'application/pdf',
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });

    it('enforces the inline file size limit', async () => {
      const oversized = Buffer.from(new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61));

      await expect(
        normalizeInlineFileBytes({
          bytes: oversized.toString('base64'),
          mimeType: 'application/pdf',
        })
      ).rejects.toBeInstanceOf(BlockedInlineFileExceedingError);
    });

    it('rejects claimed PDFs when decoded payload has fewer than 5 bytes', async () => {
      const shortPayload = Buffer.from('%PD', 'utf8');

      await expect(
        normalizeInlineFileBytes({
          bytes: shortPayload.toString('base64'),
          mimeType: 'application/pdf',
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });

    it('accepts inline text/plain bytes when they are valid UTF-8 text', async () => {
      const textBytes = Buffer.from('hello\nworld', 'utf8');

      const result = await normalizeInlineFileBytes({
        bytes: textBytes.toString('base64'),
        mimeType: 'text/plain',
      });

      expect(result.mimeType).toBe('text/plain');
      expect(Buffer.from(result.data).toString('utf8')).toBe('hello\nworld');
    });

    it('accepts inline text/markdown bytes when they are valid UTF-8 text', async () => {
      const markdownBytes = Buffer.from('# Title\n\n- item', 'utf8');

      const result = await normalizeInlineFileBytes({
        bytes: markdownBytes.toString('base64'),
        mimeType: 'text/markdown',
      });

      expect(result.mimeType).toBe('text/markdown');
      expect(Buffer.from(result.data).toString('utf8')).toBe('# Title\n\n- item');
    });

    it('accepts inline text/html bytes as raw text source', async () => {
      const htmlBytes = Buffer.from(
        '<!doctype html><html><body><h1>Hello</h1></body></html>',
        'utf8'
      );

      const result = await normalizeInlineFileBytes({
        bytes: htmlBytes.toString('base64'),
        mimeType: 'text/html',
      });

      expect(result.mimeType).toBe('text/html');
      expect(Buffer.from(result.data).toString('utf8')).toContain('<h1>Hello</h1>');
    });

    it('accepts inline text/csv bytes when they are valid UTF-8 text', async () => {
      const csvBytes = Buffer.from('name,count\nalpha,1\nbeta,2\n', 'utf8');

      const result = await normalizeInlineFileBytes({
        bytes: csvBytes.toString('base64'),
        mimeType: 'text/csv',
      });

      expect(result.mimeType).toBe('text/csv');
      expect(Buffer.from(result.data).toString('utf8')).toContain('name,count');
    });

    it('accepts inline text/x-log bytes when they are valid UTF-8 text', async () => {
      const logBytes = Buffer.from('[info] server started\n[warn] retrying\n', 'utf8');

      const result = await normalizeInlineFileBytes({
        bytes: logBytes.toString('base64'),
        mimeType: 'text/x-log',
      });

      expect(result.mimeType).toBe('text/x-log');
      expect(Buffer.from(result.data).toString('utf8')).toContain('[warn] retrying');
    });

    it('accepts inline application/json bytes when they are valid UTF-8 text', async () => {
      const jsonBytes = Buffer.from('{"name":"alpha","count":1}\n', 'utf8');

      const result = await normalizeInlineFileBytes({
        bytes: jsonBytes.toString('base64'),
        mimeType: 'application/json',
      });

      expect(result.mimeType).toBe('application/json');
      expect(Buffer.from(result.data).toString('utf8')).toContain('"count":1');
    });

    it('rejects binary bytes masquerading as text/plain', async () => {
      const binaryBytes = Buffer.from([0x00, 0x9f, 0x92, 0x96, 0xff, 0x00]);

      await expect(
        normalizeInlineFileBytes({
          bytes: binaryBytes.toString('base64'),
          mimeType: 'text/plain',
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });

    it('enforces the smaller inline text document size limit', async () => {
      const oversizedText = Buffer.alloc(TEXT_DOCUMENT_MAX_BYTES + 1, 0x61);

      await expect(
        normalizeInlineFileBytes({
          bytes: oversizedText.toString('base64'),
          mimeType: 'text/plain',
        })
      ).rejects.toBeInstanceOf(BlockedInlineFileExceedingError);
    });
  });

  describe('normalizeInlineFileBytes - office documents', () => {
    const VALID_ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]);
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    it('accepts valid ZIP bytes when mimeType is docx', async () => {
      const result = await normalizeInlineFileBytes({
        bytes: VALID_ZIP_BYTES.toString('base64'),
        mimeType: DOCX_MIME,
      });
      expect(result.mimeType).toBe(DOCX_MIME);
    });

    it('accepts valid ZIP bytes when mimeType is xlsx', async () => {
      const result = await normalizeInlineFileBytes({
        bytes: VALID_ZIP_BYTES.toString('base64'),
        mimeType: XLSX_MIME,
      });
      expect(result.mimeType).toBe(XLSX_MIME);
    });

    it('rejects non-ZIP bytes claiming to be docx', async () => {
      await expect(
        normalizeInlineFileBytes({
          bytes: VALID_PDF_BYTES.toString('base64'),
          mimeType: DOCX_MIME,
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });

    it('rejects non-ZIP bytes claiming to be xlsx', async () => {
      await expect(
        normalizeInlineFileBytes({
          bytes: VALID_PNG_BYTES.toString('base64'),
          mimeType: XLSX_MIME,
        })
      ).rejects.toBeInstanceOf(BlockedInlineUnsupportedFileBytesError);
    });
  });

  describe('resolveDownloadedFileMimeType', () => {
    it('accepts PDF signature bytes when expected mime type is application/pdf', async () => {
      await expect(
        resolveDownloadedFileMimeType(VALID_PDF_BYTES, 'application/pdf', 'application/pdf')
      ).resolves.toBe('application/pdf');
    });

    it('rejects non-PDF bytes when expected mime type is application/pdf', async () => {
      await expect(
        resolveDownloadedFileMimeType(VALID_PNG_BYTES, 'application/pdf', 'application/pdf')
      ).rejects.toThrow(/Blocked external file with unsupported bytes signature/);
    });

    it('accepts valid ZIP bytes for docx mime type', async () => {
      const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const VALID_ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]);
      await expect(
        resolveDownloadedFileMimeType(VALID_ZIP_BYTES, DOCX_MIME, DOCX_MIME)
      ).resolves.toBe(DOCX_MIME);
    });

    it('accepts valid ZIP bytes for xlsx mime type', async () => {
      const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const VALID_ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]);
      await expect(
        resolveDownloadedFileMimeType(VALID_ZIP_BYTES, XLSX_MIME, XLSX_MIME)
      ).resolves.toBe(XLSX_MIME);
    });

    it('rejects non-ZIP bytes for docx mime type', async () => {
      const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      await expect(
        resolveDownloadedFileMimeType(VALID_PDF_BYTES, DOCX_MIME, DOCX_MIME)
      ).rejects.toThrow(/Blocked external file with unsupported bytes signature/);
    });
  });
});
