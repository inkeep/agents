import { describe, expect, it } from 'vitest';
import { normalizeInlineImageBytes } from '../blob-storage/image-content-security';
import { MAX_EXTERNAL_IMAGE_BYTES } from '../blob-storage/image-security-constants';

const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);

describe('image-content-security', () => {
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
      ).rejects.toThrow(/Blocked inline image with unsupported bytes signature/);
    });

    it('rejects oversized inline bytes', async () => {
      const large = Buffer.alloc(MAX_EXTERNAL_IMAGE_BYTES + 1, 1).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: large, mimeType: 'image/png' })
      ).rejects.toThrow(/Blocked inline image exceeding/);
    });

    it('rejects disallowed mime when bytes do not sniff as image', async () => {
      const random = Buffer.alloc(64, 0x01).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: random, mimeType: 'application/octet-stream' })
      ).rejects.toThrow(/Blocked inline image with unsupported bytes signature/);
    });

    it('rejects malformed base64 payload', async () => {
      await expect(
        normalizeInlineImageBytes({ bytes: '!!!not-base64!!!', mimeType: 'image/png' })
      ).rejects.toThrow(/Invalid inline image: malformed base64 payload/);
    });

    it('rejects random bytes even when claimed mime type is allowed', async () => {
      const random = Buffer.alloc(128, 0x7f).toString('base64');
      await expect(
        normalizeInlineImageBytes({ bytes: random, mimeType: 'image/png' })
      ).rejects.toThrow(/Blocked inline image with unsupported bytes signature/);
    });
  });
});
