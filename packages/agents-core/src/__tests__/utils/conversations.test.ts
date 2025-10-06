import { describe, expect, it } from 'vitest';
import { getConversationId } from '../../utils/conversations';

describe('getConversationId', () => {
  describe('ID generation', () => {
    it('should generate a non-empty string', () => {
      const id = getConversationId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const id1 = getConversationId();
      const id2 = getConversationId();
      const id3 = getConversationId();

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id2).not.toBe(id3);
    });

    it('should generate IDs with reasonable length (nanoid default is 21)', () => {
      const id = getConversationId();
      // nanoid default length is 21, but could be slightly less if leading hyphens are removed
      expect(id.length).toBeGreaterThanOrEqual(20);
      expect(id.length).toBeLessThanOrEqual(21);
    });
  });

  describe('lowercase requirement', () => {
    it('should generate only lowercase IDs', () => {
      // Test multiple generations to ensure consistency
      for (let i = 0; i < 50; i++) {
        const id = getConversationId();
        expect(id).toBe(id.toLowerCase());
      }
    });

    it('should not contain any uppercase letters', () => {
      for (let i = 0; i < 50; i++) {
        const id = getConversationId();
        expect(/[A-Z]/.test(id)).toBe(false);
      }
    });
  });

  describe('no leading hyphens requirement', () => {
    it('should not start with a hyphen', () => {
      // Test multiple generations to ensure consistency
      for (let i = 0; i < 50; i++) {
        const id = getConversationId();
        expect(id.startsWith('-')).toBe(false);
      }
    });

    it('should not start with multiple hyphens', () => {
      for (let i = 0; i < 50; i++) {
        const id = getConversationId();
        expect(/^-+/.test(id)).toBe(false);
      }
    });
  });

  describe('character set', () => {
    it('should only contain URL-safe characters', () => {
      // nanoid uses A-Za-z0-9_- alphabet
      // After lowercase conversion: a-z0-9_-
      const urlSafePattern = /^[a-z0-9_-]+$/;

      for (let i = 0; i < 50; i++) {
        const id = getConversationId();
        expect(urlSafePattern.test(id)).toBe(true);
      }
    });

    it('should allow underscores and hyphens (but not leading hyphens)', () => {
      // Generate many IDs to potentially get ones with these characters
      const ids = Array.from({ length: 100 }, () => getConversationId());

      // Check that none start with hyphen
      for (const id of ids) {
        expect(id.startsWith('-')).toBe(false);
      }

      // IDs should be valid
      for (const id of ids) {
        expect(id.length).toBeGreaterThan(0);
        expect(/^[a-z0-9_-]+$/.test(id)).toBe(true);
      }
    });
  });

  describe('collision resistance', () => {
    it('should generate unique IDs even in rapid succession', () => {
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.add(getConversationId());
      }

      // Should have generated 1000 unique IDs
      expect(ids.size).toBe(count);
    });
  });

  describe('consistency', () => {
    it('should always return a valid ID format', () => {
      for (let i = 0; i < 100; i++) {
        const id = getConversationId();

        // Verify all requirements
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
        expect(id).toBe(id.toLowerCase());
        expect(id.startsWith('-')).toBe(false);
        expect(/^[a-z0-9_-]+$/.test(id)).toBe(true);
      }
    });
  });
});
