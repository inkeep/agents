import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposioCredentialStore } from '../../credential-stores/composio-store';
import { CredentialStoreType } from '../../types';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../utils/third-party-mcp-servers', () => ({
  getComposioInstance: vi.fn(() => ({
    connectedAccounts: {
      get: mockGet,
      delete: mockDelete,
    },
  })),
}));

describe('ComposioCredentialStore', () => {
  let store: ComposioCredentialStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ComposioCredentialStore('composio-test');
  });

  describe('constructor and properties', () => {
    it('should set id and type correctly', () => {
      expect(store.id).toBe('composio-test');
      expect(store.type).toBe(CredentialStoreType.composio);
    });
  });

  describe('get', () => {
    it('should always return null', async () => {
      const result = await store.get();
      expect(result).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true when account is ACTIVE', async () => {
      mockGet.mockResolvedValueOnce({ status: 'ACTIVE' });

      const result = await store.has('ca_test-123');

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('ca_test-123');
    });

    it('should return false when account is not ACTIVE', async () => {
      mockGet.mockResolvedValueOnce({ status: 'EXPIRED' });

      const result = await store.has('ca_test-123');

      expect(result).toBe(false);
    });

    it('should return false when account is not found', async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await store.has('ca_nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when Composio API throws', async () => {
      mockGet.mockRejectedValueOnce(new Error('API error'));

      const result = await store.has('ca_test-123');

      expect(result).toBe(false);
    });

    it('should return false when Composio is not configured', async () => {
      const { getComposioInstance } = await import('../../utils/third-party-mcp-servers');
      vi.mocked(getComposioInstance).mockReturnValueOnce(null as any);

      const result = await store.has('ca_test-123');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete the connected account and return true', async () => {
      mockDelete.mockResolvedValueOnce(undefined);

      const result = await store.delete('ca_test-123');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('ca_test-123');
    });

    it('should return false when Composio API throws', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await store.delete('ca_test-123');

      expect(result).toBe(false);
    });

    it('should return false when Composio is not configured', async () => {
      const { getComposioInstance } = await import('../../utils/third-party-mcp-servers');
      vi.mocked(getComposioInstance).mockReturnValueOnce(null as any);

      const result = await store.delete('ca_test-123');

      expect(result).toBe(false);
    });
  });

  describe('checkAvailability', () => {
    it('should return available when COMPOSIO_API_KEY is set', async () => {
      process.env.COMPOSIO_API_KEY = 'test-key';
      const result = await store.checkAvailability();
      expect(result).toEqual({ available: true });
    });

    it('should return unavailable when COMPOSIO_API_KEY is not set', async () => {
      const originalKey = process.env.COMPOSIO_API_KEY;
      delete process.env.COMPOSIO_API_KEY;

      const result = await store.checkAvailability();
      expect(result).toEqual({
        available: false,
        reason: 'COMPOSIO_API_KEY not configured',
      });

      if (originalKey) process.env.COMPOSIO_API_KEY = originalKey;
    });
  });
});
