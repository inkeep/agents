import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadExternalFile,
  forwardLookupResult,
} from '../blob-storage/external-file-downloader';
import { MAX_EXTERNAL_REDIRECTS, MAX_FILE_BYTES } from '../blob-storage/file-security-constants';
import { BlockedConnectionToPrivateIpError } from '../blob-storage/file-security-errors';

const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);
const VALID_PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('external-file-downloader', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

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

  it('returns data and mime for valid external image', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(VALID_PNG_BYTES.length),
        },
      })
    );

    const result = await downloadExternalFile('https://example.com/image.jpg');
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBe(VALID_PNG_BYTES.length);
  });

  it('returns data and mime for valid external PDF when expected mime type is PDF', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(VALID_PDF_BYTES, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(VALID_PDF_BYTES.length),
        },
      })
    );

    const result = await downloadExternalFile('https://example.com/report.pdf', {
      expectedMimeType: 'application/pdf',
    });
    expect(result.mimeType).toBe('application/pdf');
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBe(VALID_PDF_BYTES.length);
  });

  it('rejects non-PDF bytes when expected mime type is PDF', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(VALID_PNG_BYTES.length),
        },
      })
    );

    await expect(
      downloadExternalFile('https://example.com/not-a-pdf.pdf', {
        expectedMimeType: 'application/pdf',
      })
    ).rejects.toThrow(/Blocked external file with unsupported bytes signature/);
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

    await expect(downloadExternalFile('http://localhost/image.png')).rejects.toThrow(
      /Blocked external file URL resolving to private/
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

    await expect(downloadExternalFile('https://example.com/image.png')).rejects.toThrow(
      /Blocked external file URL resolving to private/
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks cloud metadata address path', async () => {
    await expect(downloadExternalFile('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /Blocked external file URL resolving to private/
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks IPv4-mapped IPv6 addresses', async () => {
    const { lookup } = vi.mocked(await import('node:dns/promises'));
    lookup.mockImplementation((...args: unknown[]) => {
      const options = args[args.length - 1];
      const isAll =
        options &&
        typeof options === 'object' &&
        'all' in options &&
        (options as { all: boolean }).all;
      const result = { address: '::ffff:127.0.0.1', family: 6 };
      return Promise.resolve(isAll ? [result] : result) as Promise<never>;
    });

    await expect(downloadExternalFile('https://example.com/image.png')).rejects.toThrow(
      /Blocked external file URL resolving to private/
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('re-validates redirect target and blocks redirect to private IP', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.png' },
      })
    );

    await expect(downloadExternalFile('https://example.com/redirect')).rejects.toThrow(
      /Blocked external file URL resolving to private/
    );
  });

  it('rejects response with image content-type but non-image bytes', async () => {
    const maliciousPayload = Buffer.from('not an image at all');
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(maliciousPayload, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(maliciousPayload.length),
        },
      })
    );

    await expect(downloadExternalFile('https://example.com/fake.png')).rejects.toThrow(
      /Blocked external file with unsupported bytes signature/
    );
  });

  it('rejects URL with disallowed port', async () => {
    await expect(downloadExternalFile('https://example.com:444/image.png')).rejects.toThrow(
      /Blocked external file URL with disallowed port/
    );
  });

  it('blocks response exceeding size limit', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(big, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(big.length) },
      })
    );

    await expect(downloadExternalFile('https://example.com/huge.png')).rejects.toThrow(
      /Blocked external file larger than/
    );
  });

  it('rejects invalid URL', async () => {
    await expect(downloadExternalFile('not-a-url')).rejects.toThrow(/Invalid external file URL/);
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

    await expect(downloadExternalFile('https://example.com/r0')).rejects.toThrow(
      /Too many redirects while downloading file/
    );
    expect(fetchMock).toHaveBeenCalledTimes(MAX_EXTERNAL_REDIRECTS + 1);
  });

  it('enforces streaming size limit when content-length under-reports', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FILE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '1',
        },
      })
    );

    await expect(downloadExternalFile('https://example.com/under-reported.png')).rejects.toThrow(
      /Blocked external file exceeding/
    );
  });

  it('maps DNS lookup failures to sanitized errors', async () => {
    const { lookup } = vi.mocked(await import('node:dns/promises'));
    lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

    await expect(downloadExternalFile('https://example.com/image.png')).rejects.toThrow(
      /Unable to resolve external file host: example\.com/
    );
  });

  it('rejects unsupported scheme', async () => {
    await expect(downloadExternalFile('ftp://example.com/image.png')).rejects.toThrow(
      /Blocked external file URL with unsupported scheme/
    );
  });

  it('rejects URL with embedded credentials', async () => {
    await expect(downloadExternalFile('https://user:pass@example.com/image.png')).rejects.toThrow(
      /Blocked external file URL with embedded credentials/
    );
  });

  it('does not leak query tokens in download errors', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('bad', {
        status: 500,
        statusText: 'Server Error',
      })
    );

    await expect(
      downloadExternalFile('https://example.com/image.png?token=super-secret#hash')
    ).rejects.toThrow(/https:\/\/example\.com\/image\.png/);

    await expect(
      downloadExternalFile('https://example.com/image.png?token=super-secret#hash')
    ).rejects.not.toThrow(/super-secret|#hash|\?/);
  });

  it('retries transient 5xx responses before failing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('oops', { status: 503, statusText: 'Service Unavailable' })
      )
      .mockResolvedValueOnce(
        new Response('oops', { status: 503, statusText: 'Service Unavailable' })
      )
      .mockResolvedValueOnce(
        new Response('oops', { status: 503, statusText: 'Service Unavailable' })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadExternalFile('https://example.com/image.png')).rejects.toThrow(
      /Failed to download file/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('succeeds after transient 5xx failure on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('oops', { status: 503, statusText: 'Service Unavailable' })
      )
      .mockResolvedValueOnce(
        new Response(VALID_PNG_BYTES, {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(VALID_PNG_BYTES.length),
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadExternalFile('https://example.com/image.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBe(VALID_PNG_BYTES.length);
  });

  it('does not retry client errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 400, statusText: 'Bad Request' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadExternalFile('https://example.com/image.png')).rejects.toThrow(
      /Failed to download file/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the full address list to the lookup callback when all records are requested', () => {
    const callback = vi.fn();
    const addresses = [
      { address: '93.184.216.34', family: 4 as const },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 as const },
    ];

    forwardLookupResult('example.com', addresses, undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, addresses);
  });

  it('blocks private addresses from lookup callback address lists', () => {
    const callback = vi.fn();

    forwardLookupResult(
      'example.com',
      [
        { address: '93.184.216.34', family: 4 as const },
        { address: '127.0.0.1', family: 4 as const },
      ],
      undefined,
      callback
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(BlockedConnectionToPrivateIpError);
  });
});
