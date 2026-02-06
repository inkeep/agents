import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestPasswordResetLink, setPasswordResetLink } from '../password-reset-link-store';

describe('password-reset-link-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setPasswordResetLink', () => {
    it('should store a password reset link entry', () => {
      const entry = {
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc123',
        token: 'abc123',
      };

      setPasswordResetLink(entry);

      const result = getLatestPasswordResetLink('test@example.com', 30_000);
      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
      expect(result?.url).toBe('https://example.com/reset?token=abc123');
      expect(result?.token).toBe('abc123');
    });

    it('should overwrite existing entry for the same email', () => {
      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=first',
        token: 'first',
      });

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=second',
        token: 'second',
      });

      const result = getLatestPasswordResetLink('test@example.com', 30_000);
      expect(result?.token).toBe('second');
      expect(result?.url).toBe('https://example.com/reset?token=second');
    });

    it('should store entries for different emails separately', () => {
      setPasswordResetLink({
        email: 'user1@example.com',
        url: 'https://example.com/reset?token=user1token',
        token: 'user1token',
      });

      setPasswordResetLink({
        email: 'user2@example.com',
        url: 'https://example.com/reset?token=user2token',
        token: 'user2token',
      });

      const result1 = getLatestPasswordResetLink('user1@example.com', 30_000);
      const result2 = getLatestPasswordResetLink('user2@example.com', 30_000);

      expect(result1?.token).toBe('user1token');
      expect(result2?.token).toBe('user2token');
    });
  });

  describe('getLatestPasswordResetLink', () => {
    it('should return null for non-existent email', () => {
      const result = getLatestPasswordResetLink('nonexistent@example.com', 30_000);
      expect(result).toBeNull();
    });

    it('should be case-insensitive for email lookup', () => {
      setPasswordResetLink({
        email: 'Test@Example.COM',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result1 = getLatestPasswordResetLink('test@example.com', 30_000);
      const result2 = getLatestPasswordResetLink('TEST@EXAMPLE.COM', 30_000);
      const result3 = getLatestPasswordResetLink('Test@Example.COM', 30_000);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      expect(result1?.token).toBe('abc');
      expect(result2?.token).toBe('abc');
      expect(result3?.token).toBe('abc');
    });

    it('should return null for expired entries based on maxAgeMs', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      // Immediately after, should be retrievable
      expect(getLatestPasswordResetLink('test@example.com', 30_000)).not.toBeNull();

      // Advance time by 29 seconds (within 30 second max age)
      vi.setSystemTime(now + 29_000);
      expect(getLatestPasswordResetLink('test@example.com', 30_000)).not.toBeNull();

      // Advance time by 31 seconds (exceeds 30 second max age)
      vi.setSystemTime(now + 31_000);
      expect(getLatestPasswordResetLink('test@example.com', 30_000)).toBeNull();
    });

    it('should respect different maxAgeMs values', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      // Advance time by 10 seconds
      vi.setSystemTime(now + 10_000);

      // Should be retrievable with 15 second max age
      expect(getLatestPasswordResetLink('test@example.com', 15_000)).not.toBeNull();

      // Should NOT be retrievable with 5 second max age
      expect(getLatestPasswordResetLink('test@example.com', 5_000)).toBeNull();
    });

    it('should return entry with createdAtMs timestamp', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = getLatestPasswordResetLink('test@example.com', 30_000);
      expect(result?.createdAtMs).toBe(now);
    });

    it('should update createdAtMs when overwriting entry', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=first',
        token: 'first',
      });

      // Advance time and set a new link
      vi.setSystemTime(now + 10_000);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=second',
        token: 'second',
      });

      const result = getLatestPasswordResetLink('test@example.com', 30_000);
      expect(result?.createdAtMs).toBe(now + 10_000);
      expect(result?.token).toBe('second');
    });
  });

  describe('edge cases', () => {
    it('should handle empty email string', () => {
      setPasswordResetLink({
        email: '',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = getLatestPasswordResetLink('', 30_000);
      expect(result).not.toBeNull();
      expect(result?.token).toBe('abc');
    });

    it('should handle zero maxAgeMs (immediately expired)', () => {
      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      // Even with 0 maxAgeMs, might still be valid at the same millisecond
      // Let's advance time slightly to ensure it's expired
      vi.advanceTimersByTime(1);

      const result = getLatestPasswordResetLink('test@example.com', 0);
      expect(result).toBeNull();
    });

    it('should handle emails with special characters', () => {
      setPasswordResetLink({
        email: 'test+tag@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = getLatestPasswordResetLink('test+tag@example.com', 30_000);
      expect(result).not.toBeNull();
      expect(result?.email).toBe('test+tag@example.com');
    });
  });
});
