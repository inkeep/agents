// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for trigger generator
 */

import { generateTriggerDefinition as originalGenerateTriggerDefinition } from '../generators/trigger-generator';
import { expectSnapshots } from '../utils';

function generateTriggerDefinition(
  ...args: Parameters<typeof originalGenerateTriggerDefinition>
): string {
  return originalGenerateTriggerDefinition(...args).getFullText();
}

describe('Trigger Generator', () => {
  const basicTriggerData = {
    name: 'GitHub Webhook',
    messageTemplate: 'New event from GitHub: {{body.action}}',
  };

  const triggerWithSignatureVerification = {
    name: 'GitHub Webhook with Signature',
    messageTemplate: 'New push event from GitHub',
    signatureVerification: {
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
    },
    signingSecretCredentialReferenceId: 'github-webhook-secret',
  };

  const triggerWithSlackSignature = {
    name: 'Slack Webhook',
    messageTemplate: 'New Slack event: {{body.event.type}}',
    signatureVerification: {
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
    },
    signingSecretCredentialReferenceId: 'slack-signing-secret',
  };

  describe('generateTriggerDefinition', () => {
    it('should generate basic trigger definition', async () => {
      const triggerId = 'github-webhook';
      const definition = generateTriggerDefinition({ triggerId, ...basicTriggerData });

      expect(definition).toContain('export const githubWebhook = new Trigger({');
      expect(definition).toContain("id: 'github-webhook',");
      expect(definition).toContain("name: 'GitHub Webhook',");
      expect(definition).toContain("messageTemplate: 'New event from GitHub: {{body.action}}'");
      expect(definition).toContain('});');
      expect(definition).not.toContain('signatureVerification:');
      expect(definition).not.toContain('signingSecretCredentialReference:');
      await expectSnapshots(definition);
    });

    it('should generate trigger with GitHub signature verification', async () => {
      const triggerId = 'github-webhook';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerWithSignatureVerification,
      });

      expect(definition).toContain('export const githubWebhook = new Trigger({');
      expect(definition).toContain('signatureVerification: {');
      expect(definition).toContain("algorithm: 'sha256',");
      expect(definition).toContain("encoding: 'hex',");
      expect(definition).toContain('signature: {');
      expect(definition).toContain("source: 'header',");
      expect(definition).toContain("key: 'x-hub-signature-256',");
      expect(definition).toContain("prefix: 'sha256='");
      expect(definition).toContain('signedComponents: [');
      expect(definition).toContain("source: 'body',");
      expect(definition).toContain('required: true');
      expect(definition).toContain('componentJoin: {');
      expect(definition).toContain("strategy: 'concatenate',");
      expect(definition).toContain("separator: ''");
      expect(definition).toContain('signingSecretCredentialReference: githubWebhookSecret');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should generate trigger with Slack signature verification', async () => {
      const triggerId = 'slack-webhook';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerWithSlackSignature,
      });

      expect(definition).toContain('signatureVerification: {');
      expect(definition).toContain("key: 'x-slack-signature',");
      expect(definition).toContain("prefix: 'v0='");
      expect(definition).toContain('signedComponents: [');
      expect(definition).toContain("source: 'literal',");
      expect(definition).toContain("value: 'v0',");
      expect(definition).toContain("key: 'x-slack-request-timestamp',");
      expect(definition).toContain("separator: ':'");
      expect(definition).toContain('validation: {');
      expect(definition).toContain('headerCaseSensitive: false,');
      expect(definition).toContain('allowEmptyBody: false,');
      expect(definition).toContain('normalizeUnicode: false');
      expect(definition).toContain('signingSecretCredentialReference: slackSigningSecret');
      await expectSnapshots(definition);
    });

    it('should generate trigger with multiple algorithms', async () => {
      const triggerDataSha512 = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          algorithm: 'sha512',
        },
      };

      const triggerId = 'webhook-sha512';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerDataSha512,
      });

      expect(definition).toContain("algorithm: 'sha512',");
      await expectSnapshots(definition);
    });

    it('should generate trigger with base64 encoding', async () => {
      const triggerDataBase64 = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          encoding: 'base64',
        },
      };

      const triggerId = 'webhook-base64';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerDataBase64,
      });

      expect(definition).toContain("encoding: 'base64',");
      await expectSnapshots(definition);
    });

    it('should generate trigger with regex in signature source', async () => {
      const triggerDataWithRegex = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          signature: {
            source: 'header',
            key: 'x-stripe-signature',
            regex: 't=([^,]+)',
          },
        },
      };

      const triggerId = 'webhook-regex';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerDataWithRegex,
      });

      expect(definition).toContain("regex: 't=([^,]+)'");
      await expectSnapshots(definition);
    });

    it('should handle optional signed components', async () => {
      const triggerDataOptional = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          signedComponents: [
            {
              source: 'header',
              key: 'x-custom-header',
              required: false,
            },
            {
              source: 'body',
              required: true,
            },
          ],
        },
      };

      const triggerId = 'webhook-optional';
      const definition = generateTriggerDefinition({
        triggerId,
        ...triggerDataOptional,
      });

      expect(definition).toContain('required: false');
      expect(definition).toContain('required: true');
      await expectSnapshots(definition);
    });
    // TODO
    it.skip('should throw error if registry missing for credential reference', () => {
      const triggerId = 'github-webhook';
      expect(() => {
        generateTriggerDefinition({
          triggerId,
          ...triggerWithSignatureVerification,
          // No registry provided
        });
      }).toThrow('Registry is required for signingSecretCredentialReferenceId generation');
    });

    it('should accept null fields and omit them from generated output', async () => {
      const triggerId = 'nullable-fields';
      const definition = generateTriggerDefinition({
        triggerId,
        name: 'Nullable Trigger',
        description: null,
        messageTemplate: null,
        outputTransform: null,
        authentication: null,
        signatureVerification: null,
        signingSecretCredentialReferenceId: null,
        signingSecretCredentialReference: null,
      });

      expect(definition).toContain("id: 'nullable-fields',");
      expect(definition).toContain("name: 'Nullable Trigger',");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('messageTemplate:');
      expect(definition).not.toContain('outputTransform:');
      expect(definition).not.toContain('authentication:');
      expect(definition).not.toContain('signatureVerification:');
      expect(definition).not.toContain('signingSecretCredentialReference:');
      await expectSnapshots(definition);
    });

    it('should accept a mix of null and defined fields', async () => {
      const triggerId = 'mixed-nullable';
      const definition = generateTriggerDefinition({
        triggerId,
        name: 'Mixed Trigger',
        description: null,
        messageTemplate: 'Event received: {{body.type}}',
        outputTransform: null,
        authentication: null,
        signatureVerification: null,
        signingSecretCredentialReferenceId: null,
      });

      expect(definition).toContain("name: 'Mixed Trigger',");
      expect(definition).toContain("messageTemplate: 'Event received: {{body.type}}'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('outputTransform:');
      expect(definition).not.toContain('authentication:');
      expect(definition).not.toContain('signatureVerification:');
      expect(definition).not.toContain('signingSecretCredentialReference:');
      await expectSnapshots(definition);
    });
  });
});
