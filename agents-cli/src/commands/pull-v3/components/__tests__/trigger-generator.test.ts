// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for trigger generator
 */

import { describe, expect, it } from 'vitest';
import { generateTriggerDefinition as generateTriggerDefinitionV4 } from '../../../pull-v4/trigger-generator';
import { expectSnapshots } from '../../../pull-v4/utils';
import type { ComponentRegistry } from '../../utils/component-registry';
import { generateTriggerDefinition } from '../trigger-generator';

// Mock registry for tests
const mockRegistry = {
  getVariableName(id, _type) {
    // If already camelCase, return as-is, otherwise convert
    if (!/[-_]/.test(id)) {
      return id;
    }
    // Convert kebab-case or snake_case to camelCase
    return id
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]/, '_$&');
  },
  getImportsForFile(_filePath, components) {
    // Mock implementation returns imports for all components
    return components.map((comp) => {
      const varName = this.getVariableName?.(comp.id, comp.type);
      return `import { ${varName || comp.id} } from '../../credentials/${comp.id}';`;
    });
  },
} satisfies Partial<ComponentRegistry>;

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

  // describe('generateTriggerImports', () => {
  // it('should generate basic imports without credential reference', () => {
  //   const imports = generateTriggerImports('github-webhook', basicTriggerData);
  //
  //   expect(imports).toHaveLength(1);
  //   expect(imports[0]).toBe("import { Trigger } from '@inkeep/agents-sdk';");
  // });

  // it('should generate imports with credential reference', () => {
  //   const imports = generateTriggerImports(
  //     'github-webhook',
  //     triggerWithSignatureVerification,
  //     { quotes: 'single', semicolons: true, indentation: '  ' },
  //     mockRegistry
  //   );
  //
  //   expect(imports.length).toBeGreaterThan(1);
  //   expect(imports[0]).toBe("import { Trigger } from '@inkeep/agents-sdk';");
  //   expect(imports[1]).toContain('github-webhook-secret');
  // });

  // it('should handle different code styles', () => {
  //   const imports = generateTriggerImports('test-trigger', basicTriggerData, {
  //     quotes: 'double',
  //     semicolons: false,
  //     indentation: '    ',
  //   });
  //
  //   expect(imports[0]).toBe('import { Trigger } from "@inkeep/agents-sdk"');
  // });
  // });

  describe('generateTriggerDefinition', () => {
    it.only('should generate basic trigger definition', async () => {
      const triggerId = 'github-webhook';
      const definition = generateTriggerDefinition(triggerId, basicTriggerData);

      expect(definition).toContain('export const githubWebhook = new Trigger({');
      expect(definition).toContain("id: 'github-webhook',");
      expect(definition).toContain("name: 'GitHub Webhook',");
      expect(definition).toContain("messageTemplate: 'New event from GitHub: {{body.action}}'");
      expect(definition).toContain('});');
      expect(definition).not.toContain('signatureVerification:');
      expect(definition).not.toContain('signingSecretCredentialReference:');
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...basicTriggerData });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should generate trigger with GitHub signature verification', async () => {
      const triggerId = 'github-webhook';
      const definition = generateTriggerDefinition(
        triggerId,
        triggerWithSignatureVerification,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

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
      const definitionV4 = generateTriggerDefinitionV4({
        triggerId,
        ...triggerWithSignatureVerification,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should generate trigger with Slack signature verification', async () => {
      const triggerId = 'slack-webhook';
      const definition = generateTriggerDefinition(
        triggerId,
        triggerWithSlackSignature,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

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
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...triggerWithSlackSignature });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should generate trigger with multiple algorithms', async () => {
      const triggerDataSha512 = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          algorithm: 'sha512',
        },
      };

      const triggerId = 'webhook-sha512';
      const definition = generateTriggerDefinition(
        triggerId,
        triggerDataSha512,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

      expect(definition).toContain("algorithm: 'sha512',");
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...triggerDataSha512 });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should generate trigger with base64 encoding', async () => {
      const triggerDataBase64 = {
        ...triggerWithSignatureVerification,
        signatureVerification: {
          ...triggerWithSignatureVerification.signatureVerification,
          encoding: 'base64',
        },
      };

      const triggerId = 'webhook-base64';
      const definition = generateTriggerDefinition(
        triggerId,
        triggerDataBase64,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

      expect(definition).toContain("encoding: 'base64',");
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...triggerDataBase64 });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should generate trigger with regex in signature source', async () => {
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
      const definition = generateTriggerDefinition(
        triggerId,
        triggerDataWithRegex,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

      expect(definition).toContain("regex: 't=([^,]+)'");
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...triggerDataWithRegex });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should handle optional signed components', async () => {
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
      const definition = generateTriggerDefinition(
        triggerId,
        triggerDataOptional,
        { quotes: 'single', semicolons: true, indentation: '  ' },
        mockRegistry
      );

      expect(definition).toContain('required: false');
      expect(definition).toContain('required: true');
      const definitionV4 = generateTriggerDefinitionV4({ triggerId, ...triggerDataOptional });
      await expectSnapshots(definition, definitionV4);
    });
    // TODO
    it.skip('should throw error if registry missing for credential reference', () => {
      const triggerId = 'github-webhook';
      expect(() => {
        generateTriggerDefinition(
          triggerId,
          triggerWithSignatureVerification,
          { quotes: 'single', semicolons: true, indentation: '  ' }
          // No registry provided
        );
      }).toThrow('Registry is required for signingSecretCredentialReferenceId generation');
      expect(() => {
        generateTriggerDefinitionV4({ triggerId, ...triggerWithSignatureVerification });
      }).toThrow(``);
    });

    // it('should handle double quotes style', () => {
    //   const definition = generateTriggerDefinition('test-trigger', basicTriggerData, {
    //     quotes: 'double',
    //     semicolons: true,
    //     indentation: '  ',
    //   });
    //
    //   expect(definition).toContain('id: "test-trigger",');
    //   expect(definition).toContain('name: "GitHub Webhook",');
    // });

    // it('should handle no semicolons style', () => {
    //   const definition = generateTriggerDefinition('test-trigger', basicTriggerData, {
    //     quotes: 'single',
    //     semicolons: false,
    //     indentation: '  ',
    //   });
    //
    //   expect(definition).toMatch(/\}\)$/);
    //   expect(definition).not.toMatch(/\}\);$/);
    // });
  });
});
