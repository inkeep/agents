import { describe, expect, it } from 'vitest';
import { createExecutionHono } from '../../app';
import { type ServerConfig, CredentialStoreRegistry } from '@inkeep/agents-core';

describe('Request Size Limit Integration - Run API', () => {
  const DEFAULT_MAX_SIZE = 1073741824; // 1GB
  const CUSTOM_MAX_SIZE = 1000; // 1KB for testing

  const createTestApp = (maxRequestSizeBytes?: number) => {
    const serverConfig: ServerConfig = {
      serverOptions: {
        maxRequestSizeBytes,
      },
    };

    const credentialStores = new CredentialStoreRegistry();
    return createExecutionHono(serverConfig, credentialStores);
  };

  describe('Default Size Limit (1GB)', () => {
    it('should allow requests under the default limit', async () => {
      const app = createTestApp();
      const contentLength = '1000000'; // 1MB

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/json',
        },
      });

      // The health endpoint doesn't accept POST, but we're testing the middleware passes
      // We expect a 404 or 405, not 413
      expect(res.status).not.toBe(413);
    });

    it('should reject requests exceeding the default limit', async () => {
      const app = createTestApp();
      const contentLength = String(DEFAULT_MAX_SIZE + 1);

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(413);

      const body = await res.json();
      expect(body.code).toBe('payload_too_large');
      expect(body.status).toBe(413);
      expect(body.title).toBe('Payload Too Large');
    });
  });

  describe('Custom Size Limit', () => {
    it('should allow requests under custom limit', async () => {
      const app = createTestApp(CUSTOM_MAX_SIZE);
      const contentLength = '500'; // 500 bytes

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/json',
        },
      });

      // Should not be rejected for size
      expect(res.status).not.toBe(413);
    });

    it('should reject requests exceeding custom limit', async () => {
      const app = createTestApp(CUSTOM_MAX_SIZE);
      const contentLength = String(CUSTOM_MAX_SIZE + 1); // 1001 bytes

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(413);

      const body = await res.json();
      expect(body.code).toBe('payload_too_large');
      expect(body.detail).toContain(String(CUSTOM_MAX_SIZE + 1));
      expect(body.detail).toContain(String(CUSTOM_MAX_SIZE));
    });
  });

  describe('HTTP Methods', () => {
    it('should skip validation for GET requests', async () => {
      const app = createTestApp(100); // Very small limit
      const contentLength = '10000'; // Exceeds limit

      const res = await app.request('/health', {
        method: 'GET',
        headers: {
          'Content-Length': contentLength,
        },
      });

      // Should succeed (GET requests are skipped)
      expect(res.status).not.toBe(413);
    });

    it('should skip validation for HEAD requests', async () => {
      const app = createTestApp(100);
      const contentLength = '10000';

      const res = await app.request('/health', {
        method: 'HEAD',
        headers: {
          'Content-Length': contentLength,
        },
      });

      expect(res.status).not.toBe(413);
    });

    it('should skip validation for OPTIONS requests', async () => {
      const app = createTestApp(100);
      const contentLength = '10000';

      const res = await app.request('/health', {
        method: 'OPTIONS',
        headers: {
          'Content-Length': contentLength,
        },
      });

      expect(res.status).not.toBe(413);
    });
  });

  describe('Missing Content-Length Header', () => {
    it('should allow POST requests without Content-Length header', async () => {
      const app = createTestApp();

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not be rejected for missing Content-Length
      expect(res.status).not.toBe(413);
    });
  });

  describe('Response Format', () => {
    it('should return Problem+JSON format for 413 errors', async () => {
      const app = createTestApp(1000);
      const contentLength = '2000';

      const res = await app.request('/health', {
        method: 'POST',
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(413);
      expect(res.headers.get('content-type')).toContain('application/problem+json');

      const body = await res.json();

      // Problem+JSON fields
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('detail');
      expect(body).toHaveProperty('code');

      // Error object for backward compatibility
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');

      // Verify values
      expect(body.title).toBe('Payload Too Large');
      expect(body.status).toBe(413);
      expect(body.code).toBe('payload_too_large');
      expect(body.error.code).toBe('payload_too_large');
    });
  });
});
