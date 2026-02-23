// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for status component generator
 */

import { generateStatusComponentDefinition as originalGenerateStatusComponentDefinition } from '../../../pull-v4/status-component-generator';
import { expectSnapshots } from '../../../pull-v4/utils';

function generateStatusComponentDefinition(
  ...args: Parameters<typeof originalGenerateStatusComponentDefinition>
): string {
  return originalGenerateStatusComponentDefinition(...args).getFullText();
}

describe('Status Component Generator', () => {
  const testComponentData = {
    type: 'tool_summary',
    description: 'Summary of tool calls and their purpose',
    detailsSchema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'Name of tool used',
        },
        purpose: {
          type: 'string',
          description: 'Why this tool was called',
        },
        outcome: {
          type: 'string',
          description: 'What was discovered or accomplished',
        },
        success: {
          type: 'boolean',
          description: 'Whether the tool call was successful',
        },
      },
      required: ['tool_name', 'purpose', 'outcome'],
    },
  };

  describe('generateStatusComponentDefinition', () => {
    it('should generate correct definition with all properties', async () => {
      const statusComponentId = 'tool-summary';
      const definition = generateStatusComponentDefinition({
        statusComponentId,
        ...testComponentData,
      });

      expect(definition).toContain('export const toolSummary = statusComponent({');
      expect(definition).toContain("type: 'tool_summary',");
      expect(definition).toContain("description: 'Summary of tool calls and their purpose',");
      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle component ID to camelCase conversion', async () => {
      const statusComponentId = 'progress-update';
      const componentData = {
        type: 'progress_update',
        description: 'Progress information',
      };
      const definition = generateStatusComponentDefinition({ statusComponentId, ...componentData });

      expect(definition).toContain('export const progressUpdate = statusComponent({');
      expect(definition).toContain("type: 'progress_update',");
      await expectSnapshots(definition);
    });

    it.skip('should throw error for missing type', () => {
      expect(() => {
        generateStatusComponentDefinition('my-status', {
          description: 'Status without explicit type',
        });
      }).toThrow("Missing required fields for status component 'my-status': type");
    });

    it('should handle components with only type', async () => {
      const statusComponentId = 'minimal';
      const componentData = { type: 'minimal_status' };
      const definition = generateStatusComponentDefinition({ statusComponentId, ...componentData });

      expect(definition).toContain('export const minimal = statusComponent({');
      expect(definition).toContain("type: 'minimal_status'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('detailsSchema:');
      await expectSnapshots(definition);
    });

    it('should handle schema field (alternative to detailsSchema)', async () => {
      const statusComponentId = 'test';
      const dataWithSchema = {
        type: 'test_status',
        description: 'Test status',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'Status value' },
          },
        },
      };

      const definition = generateStatusComponentDefinition({
        statusComponentId,
        ...dataWithSchema,
      });

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('value');
      await expectSnapshots(definition);
    });

    it('should prefer detailsSchema over schema when both exist', async () => {
      const statusComponentId = 'test';
      const dataWithBoth = {
        type: 'test_status',
        description: 'Test status',
        detailsSchema: {
          type: 'object',
          properties: {
            details: { type: 'string', description: 'Details field' },
          },
        },
        schema: {
          type: 'object',
          properties: {
            schema: { type: 'string', description: 'Schema field' },
          },
        },
      };

      const definition = generateStatusComponentDefinition({ statusComponentId, ...dataWithBoth });

      expect(definition).toContain('details');
      expect(definition).not.toContain('schema:');
      await expectSnapshots(definition);
    });

    it('should handle multiline descriptions', async () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information';
      const statusComponentId = 'test';
      const dataWithLongDesc = {
        type: 'detailed_status',
        description: longDescription,
      };

      const definition = generateStatusComponentDefinition({
        statusComponentId,
        ...dataWithLongDesc,
      });
      expect(definition).toContain(`description: '${longDescription}'`);
      await expectSnapshots(definition);
    });

    it('should handle complex nested schema', async () => {
      const statusComponentId = 'complex';
      const complexData = {
        type: 'complex_status',
        description: 'Complex status with nested schema',
        detailsSchema: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', description: 'ISO timestamp' },
                source: { type: 'string', description: 'Source system' },
              },
              required: ['timestamp'],
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
                },
              },
            },
          },
        },
      };

      const definition = generateStatusComponentDefinition({ statusComponentId, ...complexData });

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('metadata');
      expect(definition).toContain('items');
      await expectSnapshots(definition);
    });
  });

  describe('generateStatusComponentFile', () => {
    it('should generate complete file with imports and definition', async () => {
      const statusComponentId = 'tool-summary';
      const file = generateStatusComponentDefinition({ statusComponentId, ...testComponentData });

      expect(file).toContain("import { statusComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('export const toolSummary = statusComponent({');
      expect(file).toContain("type: 'tool_summary',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });
  });

  describe('compilation tests', () => {
    it('should generate code for status component without schema that compiles', async () => {
      const simpleData = {
        type: 'simple_progress',
        description: 'A simple progress status component',
      };

      const file = generateStatusComponentDefinition({
        statusComponentId: 'simple-progress',
        ...simpleData,
      });

      // Should not include zod import
      expect(file).not.toContain('import { z }');
      expect(file).toContain('import { statusComponent }');

      await expectSnapshots(file);
    });

    it.skip('should throw error for status component without type', () => {
      const noTypeData = {
        description: 'Status component without explicit type',
      };

      expect(() => {
        generateStatusComponentDefinition('fallback-status', noTypeData);
      }).toThrow("Missing required fields for status component 'fallback-status': type");
    });
  });

  describe('edge cases', () => {
    it.skip('should throw error for empty component data', () => {
      expect(() => {
        generateStatusComponentDefinition('empty', {});
      }).toThrow("Missing required fields for status component 'empty': type");
    });
  });
});
