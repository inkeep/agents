import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEmailSendStatus, setEmailSendStatus } from '../email-send-status-store';

describe('email-send-status-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setEmailSendStatus + getEmailSendStatus', () => {
    it('should store and retrieve a successful send status', () => {
      setEmailSendStatus('inv_123', { emailSent: true });
      const result = getEmailSendStatus('inv_123');
      expect(result).toEqual({ emailSent: true });
    });

    it('should store and retrieve a failed send status with error', () => {
      setEmailSendStatus('inv_456', { emailSent: false, error: 'SMTP connection refused' });
      const result = getEmailSendStatus('inv_456');
      expect(result).toEqual({ emailSent: false, error: 'SMTP connection refused' });
    });

    it('should return null for unknown keys', () => {
      const result = getEmailSendStatus('inv_unknown');
      expect(result).toBeNull();
    });

    it('should handle multiple keys independently', () => {
      setEmailSendStatus('inv_1', { emailSent: true });
      setEmailSendStatus('inv_2', { emailSent: false, error: 'timeout' });

      expect(getEmailSendStatus('inv_1')).toEqual({ emailSent: true });
      expect(getEmailSendStatus('inv_2')).toEqual({ emailSent: false, error: 'timeout' });
    });

    it('should overwrite existing entry for same key', () => {
      setEmailSendStatus('inv_1', { emailSent: false, error: 'first attempt' });
      setEmailSendStatus('inv_1', { emailSent: true });

      expect(getEmailSendStatus('inv_1')).toEqual({ emailSent: true });
    });
  });

  describe('TTL auto-expiry', () => {
    it('should expire entries after default TTL (5 minutes)', () => {
      setEmailSendStatus('inv_ttl', { emailSent: true });

      expect(getEmailSendStatus('inv_ttl')).toEqual({ emailSent: true });

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(getEmailSendStatus('inv_ttl')).toBeNull();
    });

    it('should not expire entries before TTL', () => {
      setEmailSendStatus('inv_ttl2', { emailSent: true });

      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(getEmailSendStatus('inv_ttl2')).toEqual({ emailSent: true });
    });

    it('should accept custom TTL', () => {
      setEmailSendStatus('inv_custom', { emailSent: true }, 10_000);

      expect(getEmailSendStatus('inv_custom')).toEqual({ emailSent: true });

      vi.advanceTimersByTime(10_001);

      expect(getEmailSendStatus('inv_custom')).toBeNull();
    });

    it('should reset TTL when overwriting', () => {
      setEmailSendStatus('inv_reset', { emailSent: false, error: 'first' });

      vi.advanceTimersByTime(4 * 60 * 1000);

      setEmailSendStatus('inv_reset', { emailSent: true });

      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(getEmailSendStatus('inv_reset')).toEqual({ emailSent: true });

      vi.advanceTimersByTime(1 * 60 * 1000 + 1);

      expect(getEmailSendStatus('inv_reset')).toBeNull();
    });
  });
});
