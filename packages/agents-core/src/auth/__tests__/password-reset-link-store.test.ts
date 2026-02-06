import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPasswordResetLink, waitForPasswordResetLink } from '../password-reset-link-store';

describe('password-reset-link-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('waitForPasswordResetLink + setPasswordResetLink', () => {
    it('should resolve when setPasswordResetLink is called for the same email', async () => {
      const promise = waitForPasswordResetLink('test@example.com');

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc123',
        token: 'abc123',
      });

      const result = await promise;
      expect(result.email).toBe('test@example.com');
      expect(result.url).toBe('https://example.com/reset?token=abc123');
      expect(result.token).toBe('abc123');
    });

    it('should be case-insensitive for email matching', async () => {
      const promise = waitForPasswordResetLink('Test@Example.COM');

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = await promise;
      expect(result.token).toBe('abc');
    });

    it('should handle separate emails independently', async () => {
      const promise1 = waitForPasswordResetLink('user1@example.com');
      const promise2 = waitForPasswordResetLink('user2@example.com');

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

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1.token).toBe('user1token');
      expect(result2.token).toBe('user2token');
    });

    it('should resolve with the latest entry when called multiple times for the same email', async () => {
      const promise = waitForPasswordResetLink('test@example.com');

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=first',
        token: 'first',
      });

      const result = await promise;
      expect(result.token).toBe('first');
    });

    it('should time out if setPasswordResetLink is never called', async () => {
      const promise = waitForPasswordResetLink('test@example.com', 5_000);

      vi.advanceTimersByTime(5_001);

      await expect(promise).rejects.toThrow('Timed out waiting for password reset link');
    });

    it('should not time out before the timeout period', async () => {
      const promise = waitForPasswordResetLink('test@example.com', 10_000);

      vi.advanceTimersByTime(9_000);

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = await promise;
      expect(result.token).toBe('abc');
    });

    it('should use default timeout of 10 seconds', async () => {
      const promise = waitForPasswordResetLink('test@example.com');

      vi.advanceTimersByTime(10_001);

      await expect(promise).rejects.toThrow('Timed out waiting for password reset link');
    });
  });

  describe('setPasswordResetLink without a pending listener', () => {
    it('should not throw when called without a pending waitForPasswordResetLink', () => {
      expect(() =>
        setPasswordResetLink({
          email: 'test@example.com',
          url: 'https://example.com/reset?token=abc',
          token: 'abc',
        })
      ).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle emails with special characters', async () => {
      const promise = waitForPasswordResetLink('test+tag@example.com');

      setPasswordResetLink({
        email: 'test+tag@example.com',
        url: 'https://example.com/reset?token=abc',
        token: 'abc',
      });

      const result = await promise;
      expect(result.email).toBe('test+tag@example.com');
      expect(result.token).toBe('abc');
    });

    it('should clean up resolver after resolution', async () => {
      const promise1 = waitForPasswordResetLink('test@example.com');

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=first',
        token: 'first',
      });

      await promise1;

      const promise2 = waitForPasswordResetLink('test@example.com', 1_000);

      vi.advanceTimersByTime(1_001);

      await expect(promise2).rejects.toThrow('Timed out waiting for password reset link');
    });

    it('should clean up resolver after timeout', async () => {
      const promise1 = waitForPasswordResetLink('test@example.com', 1_000);

      vi.advanceTimersByTime(1_001);

      await expect(promise1).rejects.toThrow('Timed out waiting for password reset link');

      const promise2 = waitForPasswordResetLink('test@example.com');

      setPasswordResetLink({
        email: 'test@example.com',
        url: 'https://example.com/reset?token=fresh',
        token: 'fresh',
      });

      const result = await promise2;
      expect(result.token).toBe('fresh');
    });
  });
});
