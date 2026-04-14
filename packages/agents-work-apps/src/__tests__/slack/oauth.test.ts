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
  sanitizeTenantId,
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

  describe('sanitizeTenantId', () => {
    it('should accept valid alphanumeric tenant IDs', () => {
      expect(sanitizeTenantId('tenant-1')).toBe('tenant-1');
      expect(sanitizeTenantId('org_abc123')).toBe('org_abc123');
      expect(sanitizeTenantId('MyTenant')).toBe('MyTenant');
    });

    it('should reject empty string', () => {
      expect(sanitizeTenantId('')).toBe('');
    });

    it('should reject tenant IDs with path traversal', () => {
      expect(sanitizeTenantId('../admin')).toBe('');
      expect(sanitizeTenantId('../../etc/passwd')).toBe('');
    });

    it('should reject tenant IDs with slashes', () => {
      expect(sanitizeTenantId('tenant/evil')).toBe('');
      expect(sanitizeTenantId('a%2Fb')).toBe('');
    });

    it('should reject tenant IDs with special characters', () => {
      expect(sanitizeTenantId('tenant;drop')).toBe('');
      expect(sanitizeTenantId('tenant<script>')).toBe('');
      expect(sanitizeTenantId('tenant id')).toBe('');
      expect(sanitizeTenantId('tenant.id')).toBe('');
    });
  });
});
