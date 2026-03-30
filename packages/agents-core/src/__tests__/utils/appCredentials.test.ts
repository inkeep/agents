import { describe, expect, it, vi } from 'vitest';
import { generateAppCredential } from '../../utils/apiKeys';

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
    it('should generate an id with app_ prefix', () => {
      const result = generateAppCredential();

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^app_[a-z0-9]{21}$/);
    });

    it('should generate unique credentials', () => {
      const a = generateAppCredential();
      const b = generateAppCredential();

      expect(a.id).not.toBe(b.id);
    });
  });
});
