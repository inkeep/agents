/**
 * Tests for OAuth state management (HMAC signature generation/verification)
 * Tests the actual production code from oauth.ts
 */

import * as crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../env', () => ({
  env: {
    SLACK_SIGNING_SECRET: 'test-signing-secret-for-oauth-state',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createOAuthState, getStateSigningSecret, parseOAuthState } from '../../slack/routes/oauth';

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
});
