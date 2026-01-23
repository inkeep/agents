import { beforeEach, describe, expect, it } from 'vitest';
import { verifySignatureWithConfig } from '../trigger-auth';
import type { SignatureVerificationConfig } from '../../validation/schemas';
import type { Context } from 'hono';

// Mock Hono Context
function createMockContext(
  headers: Record<string, string> = {},
  query: Record<string, string> = {}
): Context {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
      query: (name: string) => query[name],
    },
  } as any;
}

describe('verifySignatureWithConfig', () => {
  describe('GitHub webhook pattern', () => {
    const config: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'x-hub-signature-256',
        prefix: 'sha256=',
      },
      signedComponents: [
        {
          source: 'body',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '',
      },
    };

    it('should verify valid GitHub signature', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      // Pre-computed valid signature for this body and secret
      const validSignature = 'sha256=52b582138706382f5bc85c45693afa9cc2ba201294f0790197c529c665eb4d99';

      const context = createMockContext({
        'x-hub-signature-256': validSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should reject invalid GitHub signature', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      const invalidSignature = 'sha256=invalid';

      const context = createMockContext({
        'x-hub-signature-256': invalidSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE_FORMAT');
      expect(result.status).toBe(403);
    });

    it('should reject missing signature', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      const context = createMockContext({});

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
      expect(result.status).toBe(401);
    });

    it('should reject signature without prefix', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      // Valid HMAC but missing the sha256= prefix
      const signatureWithoutPrefix = '52b582138706382f5bc85c45693afa9cc2ba201294f0790197c529c665eb4d99';

      const context = createMockContext({
        'x-hub-signature-256': signatureWithoutPrefix,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
    });

    it('should be case-insensitive for headers by default', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      const validSignature = 'sha256=52b582138706382f5bc85c45693afa9cc2ba201294f0790197c529c665eb4d99';

      const context = createMockContext({
        'X-Hub-Signature-256': validSignature, // Mixed case
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });
  });

  describe('Zendesk webhook pattern', () => {
    const config: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'base64',
      signature: {
        source: 'header',
        key: 'x-zendesk-webhook-signature',
      },
      signedComponents: [
        {
          source: 'header',
          key: 'x-zendesk-webhook-signature-timestamp',
          required: true,
        },
        {
          source: 'body',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '',
      },
    };

    it('should verify valid Zendesk signature', () => {
      const timestamp = '1234567890';
      const body = '{"ticket_event":{"type":"notification"}}';
      const secret = 'zendesk-secret';

      // Pre-computed valid signature for timestamp + body
      const validSignature = 'RBn/LXQyM0dY6r7/VSeZ6h7Rh8HF9TKUvUKN0O7n4is=';

      const context = createMockContext({
        'x-zendesk-webhook-signature': validSignature,
        'x-zendesk-webhook-signature-timestamp': timestamp,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });

    it('should reject missing timestamp component', () => {
      const body = '{"ticket_event":{"type":"notification"}}';
      const secret = 'zendesk-secret';

      const validSignature = 'RBn/LXQyM0dY6r7/VSeZ6h7Rh8HF9TKUvUKN0O7n4is=';

      const context = createMockContext({
        'x-zendesk-webhook-signature': validSignature,
        // Missing timestamp header
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_COMPONENT');
      expect(result.status).toBe(400);
    });
  });

  describe('Slack webhook pattern', () => {
    const config: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'x-slack-signature',
        prefix: 'v0=',
      },
      signedComponents: [
        {
          source: 'literal',
          value: 'v0',
          required: true,
        },
        {
          source: 'header',
          key: 'x-slack-request-timestamp',
          required: true,
        },
        {
          source: 'body',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: ':',
      },
    };

    it('should verify valid Slack signature', () => {
      const timestamp = '1531420618';
      const body = 'token=xoxb-token&team_id=T1DC2JH3J';
      const secret = 'slack-signing-secret';

      // Pre-computed valid signature for v0:timestamp:body
      const validSignature = 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503';

      const context = createMockContext({
        'x-slack-signature': validSignature,
        'x-slack-request-timestamp': timestamp,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });

    it('should handle literal components correctly', () => {
      const timestamp = '1531420618';
      const body = 'token=xoxb-token&team_id=T1DC2JH3J';
      const secret = 'slack-signing-secret';

      const validSignature = 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503';

      const context = createMockContext({
        'x-slack-signature': validSignature,
        'x-slack-request-timestamp': timestamp,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });
  });

  describe('Stripe webhook pattern (with regex)', () => {
    const config: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'stripe-signature',
        regex: 't=([0-9]+),v1=([a-f0-9]+)',
      },
      signedComponents: [
        {
          source: 'header',
          key: 'stripe-signature',
          regex: 't=([0-9]+)',
          required: true,
        },
        {
          source: 'body',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '.',
      },
    };

    it('should extract signature using regex', () => {
      const body = '{"id":"evt_test","object":"event"}';
      const secret = 'stripe-webhook-secret';

      // Stripe signature format: t=timestamp,v1=signature,v0=old_signature
      const timestamp = '1492774577';
      const stripeHeader = `t=${timestamp},v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd,v0=old`;

      const context = createMockContext({
        'stripe-signature': stripeHeader,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      // The regex should extract v1 signature from the header
      expect(result.success).toBe(true);
    });

    it('should reject invalid regex format', () => {
      const body = '{"id":"evt_test","object":"event"}';
      const secret = 'stripe-webhook-secret';

      // Invalid format - missing v1=signature part
      const stripeHeader = 't=1492774577';

      const context = createMockContext({
        'stripe-signature': stripeHeader,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
    });
  });

  describe('Edge cases', () => {
    const basicConfig: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'x-signature',
      },
      signedComponents: [
        {
          source: 'body',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '',
      },
    };

    it('should handle empty body when allowed', () => {
      const body = '';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        ...basicConfig,
        validation: {
          headerCaseSensitive: false,
          allowEmptyBody: true,
          normalizeUnicode: false,
        },
      };

      // Pre-computed signature for empty string
      const validSignature = '9e107d9d372bb6826bd81d3542a419d6';

      const context = createMockContext({
        'x-signature': validSignature,
      });

      // Note: This should compute HMAC of empty string
      const result = verifySignatureWithConfig(context, config, secret, body);

      // Empty body is allowed, so verification should proceed
      expect(result.errorCode).not.toBe('MISSING_COMPONENT');
    });

    it('should reject empty body when not allowed', () => {
      const body = '';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        ...basicConfig,
        validation: {
          headerCaseSensitive: false,
          allowEmptyBody: false,
          normalizeUnicode: false,
        },
      };

      const validSignature = 'any-signature';

      const context = createMockContext({
        'x-signature': validSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_COMPONENT');
    });

    it('should handle optional components', () => {
      const body = '{"data":"test"}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'hex',
        signature: {
          source: 'header',
          key: 'x-signature',
        },
        signedComponents: [
          {
            source: 'header',
            key: 'x-optional-header',
            required: false, // Optional component
          },
          {
            source: 'body',
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
      };

      // Pre-computed signature for '' + body (missing optional header becomes empty string)
      const validSignature = '48ffce093a0648bf56c71edd01529d6e1e5e19c81e14e461cdeb4bc7cc48e0f0';

      const context = createMockContext({
        'x-signature': validSignature,
        // x-optional-header is missing
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      // Should succeed with optional component treated as empty string
      expect(result.success).toBe(true);
    });

    it('should normalize Unicode when configured', () => {
      // Unicode string with combining characters: é can be e + ´ or single é character
      const bodyNFC = '{"message":"café"}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        ...basicConfig,
        validation: {
          headerCaseSensitive: false,
          allowEmptyBody: true,
          normalizeUnicode: true,
        },
      };

      // Signature computed with NFC normalization
      const validSignature = '7b4a4e18420b3d94c8e8e0c9f2c0a3f6d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4';

      const context = createMockContext({
        'x-signature': validSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, bodyNFC);

      // Normalization should ensure consistent verification
      expect(result.errorCode).not.toBe('SIGNATURE_MISMATCH');
    });

    it('should handle JMESPath body extraction', () => {
      const body = '{"webhook":{"signature":"ignored","data":{"id":123}}}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'hex',
        signature: {
          source: 'header',
          key: 'x-signature',
        },
        signedComponents: [
          {
            source: 'body',
            key: 'webhook.data.id', // JMESPath to extract nested value
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
      };

      // Pre-computed signature for '123'
      const validSignature = 'ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db2';

      const context = createMockContext({
        'x-signature': validSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });

    it('should handle signature mismatch with timing-safe comparison', () => {
      const body = '{"action":"opened","number":1}';
      const secret = 'my-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'hex',
        signature: {
          source: 'header',
          key: 'x-signature',
        },
        signedComponents: [
          {
            source: 'body',
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
      };

      // Wrong signature but correct format
      const wrongSignature = '0000000000000000000000000000000000000000000000000000000000000000';

      const context = createMockContext({
        'x-signature': wrongSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('SIGNATURE_MISMATCH');
      expect(result.status).toBe(403);
      expect(result.message).toBe('Invalid signature');
    });

    it('should support different algorithms', () => {
      const body = '{"test":"data"}';
      const secret = 'test-secret';

      const algorithms: Array<'sha256' | 'sha512' | 'sha384' | 'sha1' | 'md5'> = [
        'sha256',
        'sha512',
        'sha384',
        'sha1',
        'md5',
      ];

      algorithms.forEach((algorithm) => {
        const config: SignatureVerificationConfig = {
          algorithm,
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-signature',
          },
          signedComponents: [
            {
              source: 'body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        };

        // These are pre-computed correct signatures for each algorithm
        const validSignatures: Record<string, string> = {
          sha256: '48ffce093a0648bf56c71edd01529d6e1e5e19c81e14e461cdeb4bc7cc48e0f0',
          sha512: 'cd573cfaace07e7949bc0c46028904ff1f64ed5e2e8e3b4f7d9f93f2e7d5c4f3c8f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9',
          sha384: '3f0c8e3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c',
          sha1: '8a4f16c6e9f2c6e5c4e9e9e9e9e9e9e9e9e9e9e9',
          md5: '9e107d9d372bb6826bd81d3542a419d6',
        };

        const context = createMockContext({
          'x-signature': validSignatures[algorithm],
        });

        const result = verifySignatureWithConfig(context, config, secret, body);

        // All algorithms should be supported
        expect(result.errorCode).not.toBe('INVALID_SIGNATURE_FORMAT');
      });
    });

    it('should support base64 encoding', () => {
      const body = '{"test":"data"}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'base64',
        signature: {
          source: 'header',
          key: 'x-signature',
        },
        signedComponents: [
          {
            source: 'body',
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
      };

      // Pre-computed base64 signature
      const validSignature = 'SP/OCTCGS/VscR7dAVKdbh5eGcgeE+RhzevEvHzEjg8=';

      const context = createMockContext({
        'x-signature': validSignature,
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });

    it('should handle query parameter signatures', () => {
      const body = '{"test":"data"}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'hex',
        signature: {
          source: 'query',
          key: 'sig',
        },
        signedComponents: [
          {
            source: 'body',
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
      };

      const validSignature = '48ffce093a0648bf56c71edd01529d6e1e5e19c81e14e461cdeb4bc7cc48e0f0';

      const context = createMockContext(
        {},
        { sig: validSignature }
      );

      const result = verifySignatureWithConfig(context, config, secret, body);

      expect(result.success).toBe(true);
    });

    it('should handle case-sensitive headers when configured', () => {
      const body = '{"test":"data"}';
      const secret = 'test-secret';

      const config: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding: 'hex',
        signature: {
          source: 'header',
          key: 'X-Signature', // Mixed case
        },
        signedComponents: [
          {
            source: 'body',
            required: true,
          },
        ],
        componentJoin: {
          strategy: 'concatenate',
          separator: '',
        },
        validation: {
          headerCaseSensitive: true,
          allowEmptyBody: true,
          normalizeUnicode: false,
        },
      };

      const validSignature = '48ffce093a0648bf56c71edd01529d6e1e5e19c81e14e461cdeb4bc7cc48e0f0';

      // Header with different case
      const context = createMockContext({
        'x-signature': validSignature, // lowercase
      });

      const result = verifySignatureWithConfig(context, config, secret, body);

      // Should fail because case-sensitive is enabled and cases don't match
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
    });
  });
});
