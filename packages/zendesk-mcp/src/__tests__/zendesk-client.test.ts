import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig, handleError, ZendeskApiError, ZendeskClient } from '../lib/zendesk-client.js';

describe('ZendeskClient', () => {
  const config = { subdomain: 'test', email: 'test@example.com', apiToken: 'token123' };

  it('constructs correct base URL', () => {
    const client = new ZendeskClient(config);
    // @ts-expect-error - accessing private for testing
    expect(client.baseUrl).toBe('https://test.zendesk.com/api/v2');
  });

  it('constructs correct auth header', () => {
    const client = new ZendeskClient(config);
    const expectedAuth = Buffer.from('test@example.com/token:token123').toString('base64');
    // @ts-expect-error - accessing private for testing
    expect(client.authHeader).toBe(`Basic ${expectedAuth}`);
  });

  it('appends query params correctly', async () => {
    const client = new ZendeskClient(config);
    const mockResponse = { ok: true, json: () => Promise.resolve({ results: [] }) };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await client.request('/search.json', { query: 'test', per_page: '25' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/search.json?');
    expect(calledUrl).toContain('query=test');
    expect(calledUrl).toContain('per_page=25');

    fetchSpy.mockRestore();
  });

  it('skips empty params', async () => {
    const client = new ZendeskClient(config);
    const mockResponse = { ok: true, json: () => Promise.resolve({}) };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await client.request('/tickets.json', { query: 'test', empty: '' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('empty');

    fetchSpy.mockRestore();
  });

  it('throws ZendeskApiError on non-ok response', async () => {
    const client = new ZendeskClient(config);
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('{"error":"Invalid credentials"}'),
      headers: new Headers(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await expect(client.request('/tickets.json')).rejects.toThrow(ZendeskApiError);
    await expect(client.request('/tickets.json')).rejects.toMatchObject({
      status: 401,
      statusText: 'Unauthorized',
    });

    vi.restoreAllMocks();
  });

  it('includes retryAfter on 429 errors', async () => {
    const client = new ZendeskClient(config);
    const headers = new Headers({ 'Retry-After': '30' });
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Rate limited'),
      headers,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    try {
      await client.request('/tickets.json');
    } catch (error) {
      expect(error).toBeInstanceOf(ZendeskApiError);
      expect((error as ZendeskApiError).retryAfter).toBe(30);
    }

    vi.restoreAllMocks();
  });
});

describe('handleError', () => {
  it('returns auth message for 401', () => {
    const error = new ZendeskApiError(401, 'Unauthorized', '');
    expect(handleError(error)).toContain('Authentication failed');
  });

  it('returns permission message for 403', () => {
    const error = new ZendeskApiError(403, 'Forbidden', '');
    expect(handleError(error)).toContain('Permission denied');
  });

  it('returns not found message for 404', () => {
    const error = new ZendeskApiError(404, 'Not Found', '');
    expect(handleError(error)).toContain('not found');
  });

  it('returns rate limit message with retry-after for 429', () => {
    const error = new ZendeskApiError(429, 'Too Many Requests', '', 45);
    const msg = handleError(error);
    expect(msg).toContain('Rate limited');
    expect(msg).toContain('45');
  });

  it('handles generic errors', () => {
    const msg = handleError(new Error('Something went wrong'));
    expect(msg).toContain('Something went wrong');
  });
});

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns config when all vars are set', () => {
    process.env.ZENDESK_SUBDOMAIN = 'test';
    process.env.ZENDESK_EMAIL = 'test@example.com';
    process.env.ZENDESK_API_TOKEN = 'token';

    const config = getConfig();
    expect(config).toEqual({
      subdomain: 'test',
      email: 'test@example.com',
      apiToken: 'token',
    });
  });

  it('exits when vars are missing', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    delete process.env.ZENDESK_SUBDOMAIN;
    delete process.env.ZENDESK_EMAIL;
    delete process.env.ZENDESK_API_TOKEN;

    expect(() => getConfig()).toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ZENDESK_SUBDOMAIN'));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
