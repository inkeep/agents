import { describe, expect, it } from 'vitest';
import { trigger } from '../../builderFunctions';
import type { SignatureVerificationConfig } from '@inkeep/agents-core';

describe('trigger builder function', () => {
  it('should create a trigger without signature verification', () => {
    const testTrigger = trigger({
      name: 'Simple Webhook',
      messageTemplate: 'Received webhook: {{event}}',
      authentication: { type: 'none' },
    });

    const config = testTrigger.getConfig();
    expect(config.name).toBe('Simple Webhook');
    expect(config.messageTemplate).toBe('Received webhook: {{event}}');
    expect(config.signatureVerification).toBeUndefined();
    expect(config.signingSecretCredentialReferenceId).toBeUndefined();
  });

  it('should create a trigger with GitHub signature verification', () => {
    const signatureVerification: SignatureVerificationConfig = {
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
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const testTrigger = trigger({
      name: 'GitHub Webhook',
      messageTemplate: 'GitHub event: {{action}}',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'github-webhook-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.name).toBe('GitHub Webhook');
    expect(config.signingSecretCredentialReferenceId).toBe('github-webhook-secret');
    expect(config.signatureVerification).toEqual(signatureVerification);
  });

  it('should create a trigger with Slack signature verification', () => {
    const signatureVerification: SignatureVerificationConfig = {
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
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const testTrigger = trigger({
      name: 'Slack Webhook',
      messageTemplate: 'Slack event: {{type}}',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'slack-signing-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.name).toBe('Slack Webhook');
    expect(config.signingSecretCredentialReferenceId).toBe('slack-signing-secret');
    expect(config.signatureVerification).toEqual(signatureVerification);
    expect(config.signatureVerification?.signedComponents).toHaveLength(3);
    expect(config.signatureVerification?.componentJoin.separator).toBe(':');
  });

  it('should create a trigger with JMESPath body extraction', () => {
    const signatureVerification: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'base64',
      signature: {
        source: 'body',
        key: 'signature',
      },
      signedComponents: [
        {
          source: 'body',
          key: 'data.payload',
          required: true,
        },
        {
          source: 'body',
          key: 'timestamp',
          required: true,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '.',
      },
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const testTrigger = trigger({
      name: 'Custom Webhook',
      messageTemplate: 'Custom event',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'custom-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.signatureVerification?.signature.source).toBe('body');
    expect(config.signatureVerification?.signature.key).toBe('signature');
    expect(config.signatureVerification?.encoding).toBe('base64');
  });

  it('should create a trigger with regex extraction', () => {
    const signatureVerification: SignatureVerificationConfig = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'stripe-signature',
        regex: 't=(\\d+),v1=([a-f0-9]+)',
      },
      signedComponents: [
        {
          source: 'header',
          key: 'stripe-signature',
          regex: 't=(\\d+)',
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
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const testTrigger = trigger({
      name: 'Stripe Webhook',
      messageTemplate: 'Stripe event: {{type}}',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'stripe-webhook-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.signatureVerification?.signature.regex).toBe('t=(\\d+),v1=([a-f0-9]+)');
    expect(config.signatureVerification?.signedComponents[0].regex).toBe('t=(\\d+)');
  });

  it('should support optional components', () => {
    const signatureVerification: SignatureVerificationConfig = {
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
        {
          source: 'header',
          key: 'x-optional-header',
          required: false,
        },
      ],
      componentJoin: {
        strategy: 'concatenate',
        separator: '',
      },
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const testTrigger = trigger({
      name: 'Webhook with Optional Components',
      messageTemplate: 'Event received',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'webhook-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.signatureVerification?.signedComponents[0].required).toBe(true);
    expect(config.signatureVerification?.signedComponents[1].required).toBe(false);
  });

  it('should support Unicode normalization option', () => {
    const signatureVerification: SignatureVerificationConfig = {
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
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: true, // Unicode normalization enabled
      },
    };

    const testTrigger = trigger({
      name: 'Webhook with Unicode Normalization',
      messageTemplate: 'Event received',
      authentication: { type: 'none' },
      signingSecretCredentialReferenceId: 'webhook-secret',
      signatureVerification,
    });

    const config = testTrigger.getConfig();
    expect(config.signatureVerification?.validation.normalizeUnicode).toBe(true);
  });

  it('should validate invalid JMESPath in signature configuration', () => {
    const invalidSignatureVerification = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'body',
        key: 'invalid..jmespath', // Invalid JMESPath syntax
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
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    } as SignatureVerificationConfig;

    expect(() => {
      trigger({
        name: 'Invalid Trigger',
        messageTemplate: 'Event',
        authentication: { type: 'none' },
        signingSecretCredentialReferenceId: 'secret',
        signatureVerification: invalidSignatureVerification,
      });
    }).toThrow();
  });

  it('should validate invalid regex in signature configuration', () => {
    const invalidSignatureVerification = {
      algorithm: 'sha256',
      encoding: 'hex',
      signature: {
        source: 'header',
        key: 'x-signature',
        regex: '(unclosed group', // Invalid regex syntax
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
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    } as SignatureVerificationConfig;

    expect(() => {
      trigger({
        name: 'Invalid Trigger',
        messageTemplate: 'Event',
        authentication: { type: 'none' },
        signingSecretCredentialReferenceId: 'secret',
        signatureVerification: invalidSignatureVerification,
      });
    }).toThrow();
  });

  it('should support all HMAC algorithms', () => {
    const algorithms = ['sha256', 'sha512', 'sha384', 'sha1', 'md5'] as const;

    algorithms.forEach((algorithm) => {
      const signatureVerification: SignatureVerificationConfig = {
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
        validation: {
          headerCaseSensitive: false,
          allowEmptyBody: false,
          normalizeUnicode: false,
        },
      };

      const testTrigger = trigger({
        name: `Webhook with ${algorithm}`,
        messageTemplate: 'Event',
        authentication: { type: 'none' },
        signingSecretCredentialReferenceId: 'secret',
        signatureVerification,
      });

      const config = testTrigger.getConfig();
      expect(config.signatureVerification?.algorithm).toBe(algorithm);
    });
  });

  it('should support both hex and base64 encodings', () => {
    const encodings = ['hex', 'base64'] as const;

    encodings.forEach((encoding) => {
      const signatureVerification: SignatureVerificationConfig = {
        algorithm: 'sha256',
        encoding,
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
        validation: {
          headerCaseSensitive: false,
          allowEmptyBody: false,
          normalizeUnicode: false,
        },
      };

      const testTrigger = trigger({
        name: `Webhook with ${encoding}`,
        messageTemplate: 'Event',
        authentication: { type: 'none' },
        signingSecretCredentialReferenceId: 'secret',
        signatureVerification,
      });

      const config = testTrigger.getConfig();
      expect(config.signatureVerification?.encoding).toBe(encoding);
    });
  });

  it('should use Trigger.with() to update signature verification', () => {
    const initialTrigger = trigger({
      name: 'Initial Webhook',
      messageTemplate: 'Event',
      authentication: { type: 'none' },
    });

    const updatedSignatureVerification: SignatureVerificationConfig = {
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
      validation: {
        headerCaseSensitive: false,
        allowEmptyBody: false,
        normalizeUnicode: false,
      },
    };

    const updatedTrigger = initialTrigger.with({
      signingSecretCredentialReferenceId: 'new-secret',
      signatureVerification: updatedSignatureVerification,
    });

    const config = updatedTrigger.getConfig();
    expect(config.signingSecretCredentialReferenceId).toBe('new-secret');
    expect(config.signatureVerification).toEqual(updatedSignatureVerification);
  });
});
