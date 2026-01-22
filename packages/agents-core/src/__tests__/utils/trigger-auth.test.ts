import { describe, expect, it } from 'vitest';
import {
  hashAuthenticationHeaders,
  hashTriggerHeaderValue,
  validateTriggerHeaderValue,
} from '../../utils/trigger-auth';

describe('trigger-auth utilities', () => {
  describe('hashTriggerHeaderValue', () => {
    it('should return valueHash and valuePrefix', async () => {
      const value = 'my-secret-key-12345';
      const result = await hashTriggerHeaderValue(value);

      expect(result.valueHash).toBeDefined();
      expect(result.valueHash.length).toBeGreaterThan(0);
      expect(result.valuePrefix).toBe('my-secre');
    });

    it('should produce different hashes for different values', async () => {
      const result1 = await hashTriggerHeaderValue('value1');
      const result2 = await hashTriggerHeaderValue('value2');

      expect(result1.valueHash).not.toBe(result2.valueHash);
    });

    it('should produce different hashes for same value (due to random salt)', async () => {
      const result1 = await hashTriggerHeaderValue('same-value');
      const result2 = await hashTriggerHeaderValue('same-value');

      expect(result1.valueHash).not.toBe(result2.valueHash);
    });

    it('should handle short values', async () => {
      const value = 'abc';
      const result = await hashTriggerHeaderValue(value);

      expect(result.valuePrefix).toBe('abc');
      expect(result.valueHash).toBeDefined();
    });
  });

  describe('validateTriggerHeaderValue', () => {
    it('should return true for matching value', async () => {
      const value = 'my-secret-key';
      const { valueHash } = await hashTriggerHeaderValue(value);

      const isValid = await validateTriggerHeaderValue(value, valueHash);
      expect(isValid).toBe(true);
    });

    it('should return false for non-matching value', async () => {
      const value = 'my-secret-key';
      const { valueHash } = await hashTriggerHeaderValue(value);

      const isValid = await validateTriggerHeaderValue('wrong-key', valueHash);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const isValid = await validateTriggerHeaderValue('some-value', 'invalid-base64!!!');
      expect(isValid).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const isValid = await validateTriggerHeaderValue('some-value', '');
      expect(isValid).toBe(false);
    });
  });

  describe('hashAuthenticationHeaders', () => {
    it('should hash all headers in array', async () => {
      const headers = [
        { name: 'X-API-Key', value: 'secret1' },
        { name: 'X-Client-ID', value: 'secret2' },
      ];

      const result = await hashAuthenticationHeaders(headers);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('X-API-Key');
      expect(result[0].valueHash).toBeDefined();
      expect(result[0].valuePrefix).toBe('secret1');
      expect(result[1].name).toBe('X-Client-ID');
      expect(result[1].valueHash).toBeDefined();
      expect(result[1].valuePrefix).toBe('secret2');
    });

    it('should return empty array for empty input', async () => {
      const result = await hashAuthenticationHeaders([]);
      expect(result).toEqual([]);
    });
  });
});
