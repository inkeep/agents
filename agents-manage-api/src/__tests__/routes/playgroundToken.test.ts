import { listApiKeys } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient';
import { env } from '../../env';
import { makeRequest } from '../utils/testRequest';
import { createTestTenantWithOrg } from '../utils/testTenant';

describe('Playground Token Routes', () => {
  const projectId = 'default';
  const agentId = 'test-agent';

  describe('POST /api/playground/token', () => {
    it.skipIf(env.DISABLE_AUTH || process.env.ENVIRONMENT === 'test')(
      'should generate JWT token (not database API key)',
      async () => {
        const tenantId = await createTestTenantWithOrg('playground-jwt-success');

        const response = await makeRequest('/api/playground/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId,
            projectId,
            agentId,
          }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data).toHaveProperty('apiKey');
        expect(data).toHaveProperty('expiresAt');

        // JWT tokens start with 'eyJ' (base64url encoded header)
        expect(data.apiKey).toMatch(/^eyJ/);
        expect(typeof data.expiresAt).toBe('string');

        // Verify expiry is approximately 1 hour from now
        const expiryDate = new Date(data.expiresAt);
        const now = new Date();
        const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        const diffMs = Math.abs(expiryDate.getTime() - hourFromNow.getTime());

        expect(diffMs).toBeLessThan(5000);

        // Should NOT be in database (JWTs are stateless)
        const apiKeys = await listApiKeys(dbClient)({
          scopes: { tenantId, projectId },
        });
        const hasMatchingKey = apiKeys.some((key) => key.keyPrefix?.includes('temp'));
        expect(hasMatchingKey).toBe(false);
      }
    );

    it.skipIf(env.DISABLE_AUTH || process.env.ENVIRONMENT === 'test')(
      'should return 401 without session',
      async () => {
        const tenantId = await createTestTenantWithOrg('playground-token-no-session');

        const response = await makeRequest('/api/playground/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId,
            projectId,
            agentId,
          }),
          customHeaders: {},
        });

        expect(response.status).toBe(401);
      }
    );

    it.skipIf(env.DISABLE_AUTH || process.env.ENVIRONMENT === 'test')(
      'should validate request body',
      async () => {
        const tenantId = await createTestTenantWithOrg('playground-token-validation');

        const response = await makeRequest('/api/playground/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId,
          }),
        });

        expect(response.status).toBe(400);
      }
    );

    it.skipIf(env.DISABLE_AUTH || process.env.ENVIRONMENT === 'test')(
      'should create unique JWT tokens for multiple requests',
      async () => {
        const tenantId = await createTestTenantWithOrg('playground-token-unique');

        const response1 = await makeRequest('/api/playground/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId,
            projectId,
            agentId,
          }),
        });

        const response2 = await makeRequest('/api/playground/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId,
            projectId,
            agentId,
          }),
        });

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);

        const data1 = await response1.json();
        const data2 = await response2.json();

        // JWTs should be different (different jti claim)
        expect(data1.apiKey).not.toBe(data2.apiKey);
        expect(data1.apiKey).toMatch(/^eyJ/);
        expect(data2.apiKey).toMatch(/^eyJ/);
      }
    );
  });
});
