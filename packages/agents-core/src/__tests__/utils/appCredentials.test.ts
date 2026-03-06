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
    it('should generate an id', () => {
      const result = generateAppCredential();

      expect(result.id).toBeDefined();
    });

    it('should generate unique credentials', () => {
      const a = generateAppCredential();
      const b = generateAppCredential();

      expect(a.id).not.toBe(b.id);
    });
  });
});
