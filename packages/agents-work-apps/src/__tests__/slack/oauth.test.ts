/**
 * Tests for OAuth state management (HMAC signature generation/verification)
 * Tests the actual production code from oauth.ts
 */

import * as crypto from 'node:crypto';
import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../env', () => ({
  env: {
    SLACK_SIGNING_SECRET: 'test-signing-secret-for-oauth-state',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../logger', () => createMockLoggerModule().module);

import {
  createOAuthState,
  getStateSigningSecret,
  parseOAuthState,
  sanitizeId,
} from '../../slack/routes/oauth';

describe('OAuth State Management', () => {
  describe('getStateSigningSecret', () => {
    it('should return the configured signing secret', () => {
      expect(getStateSigningSecret()).toBe('test-signing-secret-for-oauth-state');
    });
  });

  describe('createOAuthState', () => {
    it('should create a state with data and signature separated by dot', () => {
      const state = createOAuthState('tenant-1');
      expect(state).toContain('.');
      const parts = state.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
    });

    it('should default tenantId to empty string when not provided', () => {
      const state = createOAuthState();
      const parsed = parseOAuthState(state);
      expect(parsed?.tenantId).toBe('');
    });

    it('preserves projectId through the state roundtrip', () => {
      const state = createOAuthState('tenant-1', 'project-1');
      const parsed = parseOAuthState(state);
      expect(parsed?.projectId).toBe('project-1');
      expect(parsed?.tenantId).toBe('tenant-1');
    });

    it('defaults projectId to empty string when not provided', () => {
      const state = createOAuthState('tenant-1');
      const parsed = parseOAuthState(state);
      expect(parsed?.projectId).toBe('');
    });
  });

  describe('parseOAuthState', () => {
    it('should accept valid state with correct signature', () => {
      const state = createOAuthState('tenant-1');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();
      expect(parsed?.tenantId).toBe('tenant-1');
      expect(parsed?.nonce).toBeTruthy();
    });

    it('should reject state with tampered signature', () => {
      const state = createOAuthState('tenant-1');
      const [data] = state.split('.');
      const forgedState = `${data}.forgedSignature`;
      expect(parseOAuthState(forgedState)).toBeNull();
    });

    it('should reject state with tampered data', () => {
      const state = createOAuthState('tenant-1');
      const [, signature] = state.split('.');
      const tamperedData = Buffer.from(
        JSON.stringify({
          nonce: 'fake',
          tenantId: 'attacker-tenant',
          timestamp: Date.now(),
        })
      ).toString('base64url');
      expect(parseOAuthState(`${tamperedData}.${signature}`)).toBeNull();
    });

    it('should reject malformed state (no signature)', () => {
      const data = Buffer.from(JSON.stringify({ nonce: 'test', timestamp: Date.now() })).toString(
        'base64url'
      );
      expect(parseOAuthState(data)).toBeNull();
    });

    it('should reject empty string', () => {
      expect(parseOAuthState('')).toBeNull();
    });

    it('should accept state with empty tenantId', () => {
      const state = createOAuthState('');
      const parsed = parseOAuthState(state);
      expect(parsed?.tenantId).toBe('');
    });

    it('should reject expired state (>10 min)', () => {
      const secret = getStateSigningSecret();
      const oldState = {
        nonce: crypto.randomBytes(16).toString('hex'),
        tenantId: 'tenant-1',
        timestamp: Date.now() - 11 * 60 * 1000,
      };
      const data = Buffer.from(JSON.stringify(oldState)).toString('base64url');
      const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
      expect(parseOAuthState(`${data}.${signature}`)).toBeNull();
    });
  });

  describe('sanitizeId', () => {
    it('should accept valid alphanumeric IDs', () => {
      expect(sanitizeId('tenant-1')).toBe('tenant-1');
      expect(sanitizeId('org_abc123')).toBe('org_abc123');
      expect(sanitizeId('MyTenant')).toBe('MyTenant');
    });

    it('should reject empty string', () => {
      expect(sanitizeId('')).toBe('');
    });

    it('should reject IDs with path traversal', () => {
      expect(sanitizeId('../admin')).toBe('');
      expect(sanitizeId('../../etc/passwd')).toBe('');
    });

    it('should reject IDs with slashes', () => {
      expect(sanitizeId('tenant/evil')).toBe('');
      expect(sanitizeId('a%2Fb')).toBe('');
    });

    it('should reject IDs with special characters', () => {
      expect(sanitizeId('tenant;drop')).toBe('');
      expect(sanitizeId('tenant<script>')).toBe('');
      expect(sanitizeId('tenant id')).toBe('');
      expect(sanitizeId('tenant.id')).toBe('');
    });
  });

  describe('incoming_webhook redirect logic', () => {
    it('builds correct redirect URL when tenantId and projectId are valid', () => {
      const state = createOAuthState('tenant-1', 'project-1');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();

      const rawProjectId = parsed?.projectId || '';
      const stateProjectId = sanitizeId(rawProjectId);
      const tenantId = sanitizeId(parsed?.tenantId || '');

      expect(tenantId).toBe('tenant-1');
      expect(stateProjectId).toBe('project-1');

      const manageUiUrl = 'http://localhost:3000';
      const webhookUrl = 'https://hooks.slack.com/services/T123/B456/abc';
      const newWebhookFormUrl = new URL(
        `${manageUiUrl}/${tenantId}/projects/${stateProjectId}/webhook-destinations/new`
      );
      newWebhookFormUrl.searchParams.set('url', webhookUrl);

      expect(newWebhookFormUrl.toString()).toBe(
        'http://localhost:3000/tenant-1/projects/project-1/webhook-destinations/new?url=https%3A%2F%2Fhooks.slack.com%2Fservices%2FT123%2FB456%2Fabc'
      );
    });

    it('rejects redirect when projectId is missing from state', () => {
      const state = createOAuthState('tenant-1', '');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();

      const stateProjectId = sanitizeId(parsed?.projectId || '');
      const tenantId = sanitizeId(parsed?.tenantId || '');

      expect(tenantId).toBe('tenant-1');
      expect(stateProjectId).toBe('');
      expect(!tenantId || !stateProjectId).toBe(true);
    });

    it('rejects redirect when tenantId is missing from state', () => {
      const state = createOAuthState('', 'project-1');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();

      const stateProjectId = sanitizeId(parsed?.projectId || '');
      const tenantId = sanitizeId(parsed?.tenantId || '');

      expect(tenantId).toBe('');
      expect(stateProjectId).toBe('project-1');
      expect(!tenantId || !stateProjectId).toBe(true);
    });

    it('sanitizes projectId with path traversal before building redirect URL', () => {
      const state = createOAuthState('tenant-1', '../evil');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();

      const rawProjectId = parsed?.projectId || '';
      const stateProjectId = sanitizeId(rawProjectId);

      expect(rawProjectId).toBe('../evil');
      expect(stateProjectId).toBe('');
      expect(!stateProjectId).toBe(true);
    });

    it('sanitizes projectId with encoded slashes', () => {
      const state = createOAuthState('tenant-1', 'a%2F..%2Fevil');
      const parsed = parseOAuthState(state);
      expect(parsed).not.toBeNull();

      const stateProjectId = sanitizeId(parsed?.projectId || '');
      expect(stateProjectId).toBe('');
    });
  });
});
