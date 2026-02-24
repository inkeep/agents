import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadExternalImage } from '../blob-storage/external-image-downloader';
import { normalizeInlineImageBytes } from '../blob-storage/image-content-security';
import {
  MAX_EXTERNAL_IMAGE_BYTES,
  MAX_EXTERNAL_REDIRECTS,
} from '../blob-storage/image-security-constants';

const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('image-security', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { lookup } = vi.mocked(await import('node:dns/promises'));
    lookup.mockImplementation((...args: unknown[]) => {
      const options = args[args.length - 1];
      if (
        options &&
        typeof options === 'object' &&
        'all' in options &&
        (options as { all: boolean }).all
      ) {
        return Promise.resolve([{ address: '93.184.216.34', family: 4 }] as never);
      }
      return Promise.resolve({ address: '93.184.216.34', family: 4 } as never);
    });
  });

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

    it('rejects SVG (allowed formats from run/constants/allowed-image-formats)', async () => {
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

  describe('downloadExternalImage', () => {
    it('returns data and mime for valid external image', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(VALID_PNG_BYTES, {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
              'content-length': String(VALID_PNG_BYTES.length),
            },
          })
        )
      );

      const result = await downloadExternalImage('https://example.com/image.jpg');
      expect(result.mimeType).toBe('image/png');
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(VALID_PNG_BYTES.length);
    });

    it('blocks URLs that resolve to private IPs', async () => {
      const { lookup } = vi.mocked(await import('node:dns/promises'));
      lookup.mockImplementation((...args: unknown[]) => {
        const options = args[args.length - 1];
        const isAll =
          options &&
          typeof options === 'object' &&
          'all' in options &&
          (options as { all: boolean }).all;
        const result = { address: '127.0.0.1', family: 4 };
        return Promise.resolve(isAll ? [result] : result) as Promise<never>;
      });

      await expect(downloadExternalImage('http://localhost/image.png')).rejects.toThrow(
        /Blocked external image URL resolving to private/
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('blocks URLs that resolve to IPv6 loopback', async () => {
      const { lookup } = vi.mocked(await import('node:dns/promises'));
      lookup.mockImplementation((...args: unknown[]) => {
        const options = args[args.length - 1];
        const isAll =
          options &&
          typeof options === 'object' &&
          'all' in options &&
          (options as { all: boolean }).all;
        const result = { address: '::1', family: 6 };
        return Promise.resolve(isAll ? [result] : result) as Promise<never>;
      });

      await expect(downloadExternalImage('https://example.com/image.png')).rejects.toThrow(
        /Blocked external image URL resolving to private/
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('blocks cloud metadata address path', async () => {
      await expect(
        downloadExternalImage('http://169.254.169.254/latest/meta-data')
      ).rejects.toThrow(/Blocked external image URL resolving to private/);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('re-validates redirect target and blocks redirect to private IP', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/private.png' },
          })
        )
      );

      await expect(downloadExternalImage('https://example.com/redirect')).rejects.toThrow(
        /Blocked external image URL resolving to private/
      );
    });

    it('blocks response with non-image content-type', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<html>not image</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        )
      );

      await expect(downloadExternalImage('https://example.com/page')).rejects.toThrow(
        /Blocked external image with non-image content-type/
      );
    });

    it('rejects URL with disallowed port', async () => {
      await expect(downloadExternalImage('https://example.com:444/image.png')).rejects.toThrow(
        /Blocked external image URL with disallowed port/
      );
    });

    it('blocks response exceeding size limit', async () => {
      const big = new Uint8Array(MAX_EXTERNAL_IMAGE_BYTES + 1);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(big, {
            status: 200,
            headers: { 'content-type': 'image/png', 'content-length': String(big.length) },
          })
        )
      );

      await expect(downloadExternalImage('https://example.com/huge.png')).rejects.toThrow(
        /Blocked external image larger than/
      );
    });

    it('rejects invalid URL', async () => {
      await expect(downloadExternalImage('not-a-url')).rejects.toThrow(
        /Invalid external image URL/
      );
    });

    it('enforces redirect limit', async () => {
      const fetchMock = vi.fn();
      for (let i = 0; i <= MAX_EXTERNAL_REDIRECTS; i++) {
        fetchMock.mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: `https://example.com/r${i + 1}` },
          })
        );
      }
      vi.stubGlobal('fetch', fetchMock);

      await expect(downloadExternalImage('https://example.com/r0')).rejects.toThrow(
        /Too many redirects while downloading image/
      );
      expect(fetchMock).toHaveBeenCalledTimes(MAX_EXTERNAL_REDIRECTS + 1);
    });

    it('enforces streaming size limit when content-length under-reports', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_EXTERNAL_IMAGE_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(stream, {
            status: 200,
            headers: {
              'content-type': 'image/png',
              'content-length': '1',
            },
          })
        )
      );

      await expect(downloadExternalImage('https://example.com/under-reported.png')).rejects.toThrow(
        /Blocked external image exceeding/
      );
    });

    it('maps DNS lookup failures to sanitized errors', async () => {
      const { lookup } = vi.mocked(await import('node:dns/promises'));
      lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await expect(downloadExternalImage('https://example.com/image.png')).rejects.toThrow(
        /Unable to resolve external image host: example\.com/
      );
    });

    it('rejects unsupported scheme', async () => {
      await expect(downloadExternalImage('ftp://example.com/image.png')).rejects.toThrow(
        /Blocked external image URL with unsupported scheme/
      );
    });

    it('rejects URL with embedded credentials', async () => {
      await expect(
        downloadExternalImage('https://user:pass@example.com/image.png')
      ).rejects.toThrow(/Blocked external image URL with embedded credentials/);
    });

    it('does not leak query tokens in download errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('bad', {
            status: 500,
            statusText: 'Server Error',
          })
        )
      );

      await expect(
        downloadExternalImage('https://example.com/image.png?token=super-secret#hash')
      ).rejects.toThrow(/https:\/\/example\.com\/image\.png/);

      await expect(
        downloadExternalImage('https://example.com/image.png?token=super-secret#hash')
      ).rejects.not.toThrow(/super-secret|#hash|\?/);
    });
  });
});
