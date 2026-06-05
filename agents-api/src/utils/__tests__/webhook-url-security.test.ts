import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core/external-fetch', () => ({
  isBlockedIpAddress: vi.fn(),
  validateUrlResolvesToPublicIp: vi.fn(),
}));

vi.mock('../../logger', () => createMockLoggerModule().module);

import { validateUrlResolvesToPublicIp } from '@inkeep/agents-core/external-fetch';
import {
  fetchWithSsrfProtection,
  validateWebhookUrl,
  WebhookUrlSecurityError,
} from '../webhook-url-security';

const mockValidatePublicIp = validateUrlResolvesToPublicIp as ReturnType<typeof vi.fn>;

describe('webhook-url-security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidatePublicIp.mockResolvedValue(undefined);
  });

  describe('validateWebhookUrl', () => {
    it('accepts valid https URL', () => {
      const url = validateWebhookUrl('https://hook.example.com/endpoint');
      expect(url.hostname).toBe('hook.example.com');
    });

    it('accepts valid http URL', () => {
      const url = validateWebhookUrl('http://hook.example.com/endpoint');
      expect(url.hostname).toBe('hook.example.com');
    });

    it('rejects invalid URL', () => {
      expect(() => validateWebhookUrl('not-a-url')).toThrow(WebhookUrlSecurityError);
      expect(() => validateWebhookUrl('not-a-url')).toThrow('Invalid URL');
    });

    it('rejects non-http/https protocols', () => {
      expect(() => validateWebhookUrl('ftp://example.com')).toThrow(WebhookUrlSecurityError);
      expect(() => validateWebhookUrl('file:///etc/passwd')).toThrow(WebhookUrlSecurityError);
      expect(() => validateWebhookUrl('javascript:alert(1)')).toThrow(WebhookUrlSecurityError);
    });

    it('rejects URLs with embedded credentials', () => {
      expect(() => validateWebhookUrl('https://user:pass@example.com')).toThrow(
        'embedded credentials'
      );
    });

    it('allows non-standard ports', () => {
      const url = validateWebhookUrl('https://hook.example.com:8443/endpoint');
      expect(url.port).toBe('8443');
    });
  });

  describe('fetchWithSsrfProtection', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('validates URL resolves to public IP before fetching', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal('fetch', mockFetch);

      await fetchWithSsrfProtection('https://public.example.com/hook', {
        method: 'POST',
        body: '{}',
      });

      expect(mockValidatePublicIp).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: 'public.example.com' })
      );
      expect(mockFetch).toHaveBeenCalled();
    });

    it('blocks requests to private IPs', async () => {
      mockValidatePublicIp.mockRejectedValue(new Error('URL resolves to private IP'));

      await expect(
        fetchWithSsrfProtection('https://internal.example.com/hook', {
          method: 'POST',
          body: '{}',
        })
      ).rejects.toThrow();
    });

    it('rejects ftp:// protocol', async () => {
      await expect(
        fetchWithSsrfProtection('ftp://example.com/file', { method: 'POST', body: '{}' })
      ).rejects.toThrow(WebhookUrlSecurityError);
    });

    it('forces redirect: manual on the underlying fetch (caller cannot opt out)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 200, headers: new Headers() });
      vi.stubGlobal('fetch', mockFetch);

      await fetchWithSsrfProtection('https://public.example.com/hook', {
        method: 'POST',
        body: '{}',
        redirect: 'follow' as RequestRedirect,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.redirect).toBe('manual');
    });

    it('follows a redirect after re-validating the Location URL against SSRF policy', async () => {
      const finalResponse = { status: 200, headers: new Headers() };
      const redirectResponse = {
        status: 302,
        headers: new Headers({ location: 'https://final.example.com/path' }),
      };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectResponse)
        .mockResolvedValueOnce(finalResponse);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchWithSsrfProtection('https://hook.example.com/endpoint', {
        method: 'POST',
        body: '{}',
      });

      expect(result).toBe(finalResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockValidatePublicIp).toHaveBeenCalledTimes(2);
      expect(mockValidatePublicIp.mock.calls[0][0].hostname).toBe('hook.example.com');
      expect(mockValidatePublicIp.mock.calls[1][0].hostname).toBe('final.example.com');
    });

    it('blocks a redirect to a private IP (the open-redirect SSRF bypass scenario)', async () => {
      const redirectToInternal = {
        status: 302,
        headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
      };
      const mockFetch = vi.fn().mockResolvedValueOnce(redirectToInternal);
      vi.stubGlobal('fetch', mockFetch);

      mockValidatePublicIp
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('URL resolves to private IP'));

      await expect(
        fetchWithSsrfProtection('https://attacker.example.com/hook', {
          method: 'POST',
          body: '{}',
        })
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockValidatePublicIp).toHaveBeenCalledTimes(2);
    });

    it('rejects redirect to a non-http(s) protocol', async () => {
      const redirectToFtp = {
        status: 302,
        headers: new Headers({ location: 'ftp://attacker.example.com/loot' }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(redirectToFtp));

      await expect(
        fetchWithSsrfProtection('https://hook.example.com/endpoint', {
          method: 'POST',
          body: '{}',
        })
      ).rejects.toThrow(WebhookUrlSecurityError);
    });

    it('throws when redirect response is missing Location header', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({ status: 302, headers: new Headers() });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        fetchWithSsrfProtection('https://hook.example.com/endpoint', {
          method: 'POST',
          body: '{}',
        })
      ).rejects.toThrow('Redirect response missing Location header');
    });

    it('caps redirect chain length and throws on excess', async () => {
      const redirectFor = (next: number) => ({
        status: 302,
        headers: new Headers({ location: `https://hop${next}.example.com/x` }),
      });
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectFor(1))
        .mockResolvedValueOnce(redirectFor(2))
        .mockResolvedValueOnce(redirectFor(3))
        .mockResolvedValueOnce(redirectFor(4))
        .mockResolvedValueOnce(redirectFor(5))
        .mockResolvedValueOnce(redirectFor(6));
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        fetchWithSsrfProtection('https://hop0.example.com/x', { method: 'POST', body: '{}' })
      ).rejects.toThrow('Too many redirects');
    });

    it('resolves Location relative to the current URL', async () => {
      const finalResponse = { status: 200, headers: new Headers() };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 302,
          headers: new Headers({ location: '/redirected/path' }),
        })
        .mockResolvedValueOnce(finalResponse);
      vi.stubGlobal('fetch', mockFetch);

      await fetchWithSsrfProtection('https://hook.example.com/start', {
        method: 'POST',
        body: '{}',
      });

      const secondCallUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondCallUrl).toBe('https://hook.example.com/redirected/path');
    });
  });
});
