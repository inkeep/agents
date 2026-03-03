import { describe, expect, it, vi } from 'vitest';
import {
  extractAppPublicId,
  generateAppCredential,
  generateAppSecret,
  validateApiKey,
} from '../../utils/apiKeys';

vi.mock('../../env.js', () => ({
  env: {
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
  })),
}));

describe('App Credential Utilities', () => {
  describe('generateAppCredential', () => {
    it('should generate an id, publicId, and appId', () => {
      const result = generateAppCredential();

      expect(result.id).toBeDefined();
      expect(result.publicId).toBeDefined();
      expect(result.publicId).toHaveLength(12);
      expect(result.appId).toBe(`app_${result.publicId}`);
    });

    it('should generate unique credentials', () => {
      const a = generateAppCredential();
      const b = generateAppCredential();

      expect(a.publicId).not.toBe(b.publicId);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('generateAppSecret', () => {
    it('should generate a secret with as_ prefix', async () => {
      const result = await generateAppSecret('abc123def456');

      expect(result.secret).toMatch(/^as_abc123def456\./);
      expect(result.keyHash).toBeDefined();
      expect(result.keyPrefix).toHaveLength(12);
    });

    it('should produce a validatable hash', async () => {
      const result = await generateAppSecret('abc123def456');
      const isValid = await validateApiKey(result.secret, result.keyHash);

      expect(isValid).toBe(true);
    });

    it('should reject wrong secret against hash', async () => {
      const result = await generateAppSecret('abc123def456');
      const isValid = await validateApiKey('wrong_secret', result.keyHash);

      expect(isValid).toBe(false);
    });
  });

  describe('extractAppPublicId', () => {
    it('should extract publicId from app_<publicId>', () => {
      const result = extractAppPublicId('app_abc123def456');

      expect(result).toBe('abc123def456');
    });

    it('should return null for wrong prefix', () => {
      expect(extractAppPublicId('sk_abc123def456')).toBeNull();
      expect(extractAppPublicId('abc123def456')).toBeNull();
    });

    it('should return null for wrong length', () => {
      expect(extractAppPublicId('app_short')).toBeNull();
      expect(extractAppPublicId('app_toolongpublicidhere')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractAppPublicId('')).toBeNull();
    });
  });
});
