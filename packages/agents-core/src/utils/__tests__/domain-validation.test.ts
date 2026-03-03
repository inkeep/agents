import { describe, expect, it } from 'vitest';
import { validateOrigin } from '../domain-validation';

describe('validateOrigin', () => {
  describe('exact domain matching', () => {
    it('should match exact domain', () => {
      expect(validateOrigin('https://help.customer.com', ['help.customer.com'])).toBe(true);
    });

    it('should reject non-matching domain', () => {
      expect(validateOrigin('https://evil.com', ['help.customer.com'])).toBe(false);
    });

    it('should match one of multiple allowed domains', () => {
      expect(
        validateOrigin('https://docs.customer.com', ['help.customer.com', 'docs.customer.com'])
      ).toBe(true);
    });
  });

  describe('wildcard subdomain matching', () => {
    it('should match subdomain with wildcard', () => {
      expect(validateOrigin('https://help.customer.com', ['*.customer.com'])).toBe(true);
    });

    it('should match deep subdomain with wildcard', () => {
      expect(validateOrigin('https://a.b.customer.com', ['*.customer.com'])).toBe(true);
    });

    it('should match the base domain with wildcard', () => {
      expect(validateOrigin('https://customer.com', ['*.customer.com'])).toBe(true);
    });

    it('should not match unrelated domain with wildcard', () => {
      expect(validateOrigin('https://evil.com', ['*.customer.com'])).toBe(false);
    });
  });

  describe('bare wildcard rejection', () => {
    it('should reject bare * as allowed domain', () => {
      expect(validateOrigin('https://anything.com', ['*'])).toBe(false);
    });
  });

  describe('missing or invalid origin', () => {
    it('should return false for null origin', () => {
      expect(validateOrigin(null, ['help.customer.com'])).toBe(false);
    });

    it('should return false for undefined origin', () => {
      expect(validateOrigin(undefined, ['help.customer.com'])).toBe(false);
    });

    it('should return false for empty string origin', () => {
      expect(validateOrigin('', ['help.customer.com'])).toBe(false);
    });

    it('should return false for empty allowed domains', () => {
      expect(validateOrigin('https://help.customer.com', [])).toBe(false);
    });

    it('should return false for invalid URL origin', () => {
      expect(validateOrigin('not-a-url', ['help.customer.com'])).toBe(false);
    });
  });

  describe('localhost and development', () => {
    it('should match localhost', () => {
      expect(validateOrigin('http://localhost:3000', ['localhost'])).toBe(true);
    });

    it('should match 127.0.0.1', () => {
      expect(validateOrigin('http://127.0.0.1:8080', ['127.0.0.1'])).toBe(true);
    });
  });

  describe('protocol handling', () => {
    it('should match regardless of protocol', () => {
      expect(validateOrigin('http://help.customer.com', ['help.customer.com'])).toBe(true);
      expect(validateOrigin('https://help.customer.com', ['help.customer.com'])).toBe(true);
    });

    it('should ignore port in origin', () => {
      expect(validateOrigin('https://help.customer.com:8443', ['help.customer.com'])).toBe(true);
    });
  });
});
