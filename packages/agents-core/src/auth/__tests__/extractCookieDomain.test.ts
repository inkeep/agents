import { describe, expect, it } from 'vitest';
import { extractCookieDomain } from '../auth';

describe('extractCookieDomain', () => {
  describe('with explicit domain override', () => {
    it('should return the explicit domain as-is when it starts with a dot', () => {
      expect(extractCookieDomain('https://api.agents.inkeep.com', '.inkeep.com')).toBe(
        '.inkeep.com'
      );
    });

    it('should prepend a dot when the explicit domain does not start with one', () => {
      expect(extractCookieDomain('https://api.agents.inkeep.com', 'inkeep.com')).toBe(
        '.inkeep.com'
      );
    });

    it('should use explicit domain regardless of baseURL', () => {
      expect(extractCookieDomain('http://localhost:3002', '.inkeep.com')).toBe('.inkeep.com');
    });
  });

  describe('auto-computed from baseURL (no override)', () => {
    it('should return undefined for localhost', () => {
      expect(extractCookieDomain('http://localhost:3002')).toBeUndefined();
    });

    it('should return undefined for IP addresses', () => {
      expect(extractCookieDomain('http://127.0.0.1:3002')).toBeUndefined();
      expect(extractCookieDomain('http://192.168.1.1:3002')).toBeUndefined();
    });

    it('should handle 2-part domains (e.g., inkeep.com)', () => {
      expect(extractCookieDomain('https://inkeep.com')).toBe('.inkeep.com');
    });

    it('should handle 3-part domains (e.g., pilot.inkeep.com)', () => {
      expect(extractCookieDomain('https://pilot.inkeep.com')).toBe('.pilot.inkeep.com');
    });

    it('should handle 4-part domains by dropping the first part (e.g., api.pilot.inkeep.com)', () => {
      expect(extractCookieDomain('https://api.pilot.inkeep.com')).toBe('.pilot.inkeep.com');
    });

    it('should handle 4-part domains with different structure (e.g., api.agents.inkeep.com)', () => {
      expect(extractCookieDomain('https://api.agents.inkeep.com')).toBe('.agents.inkeep.com');
    });

    it('should return undefined for single-part hostnames', () => {
      expect(extractCookieDomain('http://myhost')).toBeUndefined();
    });

    it('should return undefined for invalid URLs', () => {
      expect(extractCookieDomain('not-a-url')).toBeUndefined();
    });
  });

  describe('production domain scenarios', () => {
    it('old structure: api.pilot.inkeep.com and pilot.inkeep.com share .pilot.inkeep.com', () => {
      const apiDomain = extractCookieDomain('https://api.pilot.inkeep.com');
      expect(apiDomain).toBe('.pilot.inkeep.com');
    });

    it('new structure: api.agents.inkeep.com needs AUTH_COOKIE_DOMAIN=.inkeep.com to share with app.inkeep.com', () => {
      const withoutOverride = extractCookieDomain('https://api.agents.inkeep.com');
      expect(withoutOverride).toBe('.agents.inkeep.com');

      const withOverride = extractCookieDomain('https://api.agents.inkeep.com', '.inkeep.com');
      expect(withOverride).toBe('.inkeep.com');
    });
  });
});
