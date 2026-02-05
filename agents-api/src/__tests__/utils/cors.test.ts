import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBaseDomain, getRootDomain } from '../../middleware/cors';

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: undefined,
  },
}));

describe('getBaseDomain', () => {
  it('should return the last 3 parts for hostnames with 4+ parts', () => {
    expect(getBaseDomain('app.preview.inkeep.com')).toBe('preview.inkeep.com');
    expect(getBaseDomain('agents-manage-ui.preview.inkeep.com')).toBe('preview.inkeep.com');
    expect(getBaseDomain('deep.nested.subdomain.example.com')).toBe('subdomain.example.com');
  });

  it('should return the last 3 parts for hostnames with exactly 3 parts', () => {
    expect(getBaseDomain('preview.inkeep.com')).toBe('preview.inkeep.com');
    expect(getBaseDomain('www.example.com')).toBe('www.example.com');
  });

  it('should return hostname as-is for 2-part domains', () => {
    expect(getBaseDomain('inkeep.com')).toBe('inkeep.com');
    expect(getBaseDomain('example.org')).toBe('example.org');
  });

  it('should return hostname as-is for single-part hostnames', () => {
    expect(getBaseDomain('localhost')).toBe('localhost');
  });

  it('should handle empty string', () => {
    expect(getBaseDomain('')).toBe('');
  });
});

describe('getRootDomain', () => {
  it('should return the last 2 parts for multi-part hostnames', () => {
    expect(getRootDomain('api.agents.inkeep.com')).toBe('inkeep.com');
    expect(getRootDomain('app.inkeep.com')).toBe('inkeep.com');
    expect(getRootDomain('agents-manage-ui.preview.inkeep.com')).toBe('inkeep.com');
  });

  it('should return hostname as-is for 2-part domains', () => {
    expect(getRootDomain('inkeep.com')).toBe('inkeep.com');
  });

  it('should return hostname as-is for single-part hostnames', () => {
    expect(getRootDomain('localhost')).toBe('localhost');
  });
});

describe('isOriginAllowed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when origin is undefined or invalid', () => {
    it('should return false for undefined origin', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed(undefined)).toBe(false);
    });

    it('should return false for empty string', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('')).toBe(false);
    });

    it('should return false for invalid URL', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('not-a-url')).toBe(false);
    });
  });

  describe('development mode (localhost API)', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'http://localhost:3002',
          INKEEP_AGENTS_MANAGE_UI_URL: undefined,
        },
      }));
    });

    it('should allow localhost origins', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://localhost')).toBe(true);
    });

    it('should allow 127.0.0.1 origins', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1')).toBe(true);
    });

    it('should reject non-localhost origins in dev mode', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://example.com')).toBe(false);
      expect(isOriginAllowed('https://preview.inkeep.com')).toBe(false);
    });
  });

  describe('development mode (127.0.0.1 API)', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'http://127.0.0.1:3002',
          INKEEP_AGENTS_MANAGE_UI_URL: undefined,
        },
      }));
    });

    it('should allow localhost and 127.0.0.1 origins', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    });
  });

  describe('production mode with explicit UI URL (same base domain)', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'https://agents-api.inkeep.com',
          INKEEP_AGENTS_MANAGE_UI_URL: 'https://agents-manage-ui.inkeep.com',
        },
      }));
    });

    it('should allow the exact UI URL hostname', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://agents-manage-ui.inkeep.com')).toBe(true);
    });

    it('should allow 4-part hostnames with matching base domain', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://app.agents-api.inkeep.com')).toBe(true);
    });

    it('should reject origins from different root domains', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
      expect(isOriginAllowed('https://inkeep.com.evil.com')).toBe(false);
    });
  });

  describe('production mode with different 3-part bases (app.inkeep.com + api.agents.inkeep.com)', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'https://api.agents.inkeep.com',
          INKEEP_AGENTS_MANAGE_UI_URL: 'https://app.inkeep.com',
        },
      }));
    });

    it('should allow the exact UI URL hostname', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://app.inkeep.com')).toBe(true);
    });

    it('should allow origins sharing the same root domain as both API and UI', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://other.inkeep.com')).toBe(true);
      expect(isOriginAllowed('https://api.agents.inkeep.com')).toBe(true);
    });

    it('should reject origins from different root domains', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
      expect(isOriginAllowed('https://inkeep.com.evil.com')).toBe(false);
    });
  });

  describe('production mode with preview environment', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'https://agents-api.preview.inkeep.com',
          INKEEP_AGENTS_MANAGE_UI_URL: undefined,
        },
      }));
    });

    it('should allow origins from the same preview base domain', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://agents-manage-ui.preview.inkeep.com')).toBe(true);
      expect(isOriginAllowed('https://other-app.preview.inkeep.com')).toBe(true);
    });

    it('should reject origins from production domain', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://agents-manage-ui.inkeep.com')).toBe(false);
    });

    it('should reject origins from different preview environments', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://app.staging.inkeep.com')).toBe(false);
    });
  });

  describe('root domain fallback requires UI URL to be set', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: 'https://api.agents.inkeep.com',
          INKEEP_AGENTS_MANAGE_UI_URL: undefined,
        },
      }));
    });

    it('should NOT allow root domain match when UI URL is not configured', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('https://app.inkeep.com')).toBe(false);
    });
  });

  describe('fallback when API URL is not set', () => {
    beforeEach(() => {
      vi.doMock('../../env', () => ({
        env: {
          INKEEP_AGENTS_API_URL: undefined,
          INKEEP_AGENTS_MANAGE_UI_URL: undefined,
        },
      }));
    });

    it('should default to localhost behavior', async () => {
      const { isOriginAllowed } = await import('../../middleware/cors');
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('https://example.com')).toBe(false);
    });
  });
});
