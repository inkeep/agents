// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for status component generator
 */

import { generateStatusComponentDefinition as generateStatusComponentDefinitionV4 } from '../../../pull-v4/status-component-generator';
import { expectSnapshots } from '../../../pull-v4/utils';
import {
  generateStatusComponentDefinition,
  generateStatusComponentFile,
  generateStatusComponentImports,
} from '../status-component-generator';

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

  describe('generateStatusComponentImports', () => {
    it('should generate correct imports with schema', () => {
      const imports = generateStatusComponentImports(testComponentData);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { z } from 'zod';");
    });

    it('should generate only statusComponent import without schema', () => {
      const dataWithoutSchema = {
        type: 'simple_status',
        description: 'Simple status component',
      };
      const imports = generateStatusComponentImports(dataWithoutSchema);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk';");
    });

    // it('should handle double quotes style', () => {
    //   const imports = generateStatusComponentImports(testComponentData, {
    //     quotes: 'double',
    //     semicolons: true,
    //     indentation: '  ',
    //   });
    //
    //   expect(imports[0]).toBe('import { statusComponent } from "@inkeep/agents-sdk";');
    //   expect(imports[1]).toBe('import { z } from "zod";');
    // });

    // it('should handle no semicolons style', () => {
    //   const imports = generateStatusComponentImports(testComponentData, {
    //     quotes: 'single',
    //     semicolons: false,
    //     indentation: '  ',
    //   });
    //
    //   expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk'");
    //   expect(imports[1]).toBe("import { z } from 'zod'");
    // });
  });

  describe('generateStatusComponentDefinition', () => {
    it.only('should generate correct definition with all properties', async () => {
      const statusComponentId = 'tool-summary';
      const definition = generateStatusComponentDefinition(statusComponentId, testComponentData);

      expect(definition).toContain('export const toolSummary = statusComponent({');
      expect(definition).toContain("type: 'tool_summary',");
      expect(definition).toContain("description: 'Summary of tool calls and their purpose',");
      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('});');

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...testComponentData,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should handle component ID to camelCase conversion', async () => {
      const statusComponentId = 'progress-update';
      const componentData = {
        type: 'progress_update',
        description: 'Progress information',
      };
      const definition = generateStatusComponentDefinition(statusComponentId, componentData);

      expect(definition).toContain('export const progressUpdate = statusComponent({');
      expect(definition).toContain("type: 'progress_update',");

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...componentData,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it('should throw error for missing type', () => {
      expect(() => {
        generateStatusComponentDefinition('my-status', {
          description: 'Status without explicit type',
        });
      }).toThrow("Missing required fields for status component 'my-status': type");
    });

    it.only('should handle components with only type', async () => {
      const statusComponentId = 'minimal';
      const componentData = { type: 'minimal_status' };
      const definition = generateStatusComponentDefinition(statusComponentId, componentData);

      expect(definition).toContain('export const minimal = statusComponent({');
      expect(definition).toContain("type: 'minimal_status'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('detailsSchema:');

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...componentData,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should handle schema field (alternative to detailsSchema)', async () => {
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

      const definition = generateStatusComponentDefinition(statusComponentId, dataWithSchema);

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('value');

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...dataWithSchema,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should prefer detailsSchema over schema when both exist', async () => {
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

      const definition = generateStatusComponentDefinition(statusComponentId, dataWithBoth);

      expect(definition).toContain('details');
      expect(definition).not.toContain('schema:');

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...dataWithBoth,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should handle multiline descriptions', async () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information';
      const statusComponentId = 'test';
      const dataWithLongDesc = {
        type: 'detailed_status',
        description: longDescription,
      };

      const definition = generateStatusComponentDefinition(statusComponentId, dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...dataWithLongDesc,
      });
      await expectSnapshots(definition, definitionV4);
    });

    it.only('should handle complex nested schema', async () => {
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

      const definition = generateStatusComponentDefinition(statusComponentId, complexData);

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('metadata');
      expect(definition).toContain('items');

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...complexData,
      });
      await expectSnapshots(definition, definitionV4);
    });
  });

  describe('generateStatusComponentFile', () => {
    it.only('should generate complete file with imports and definition', async () => {
      const statusComponentId = 'tool-summary';
      const file = generateStatusComponentFile(statusComponentId, testComponentData);

      expect(file).toContain("import { statusComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('export const toolSummary = statusComponent({');
      expect(file).toContain("type: 'tool_summary',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      const definitionV4 = generateStatusComponentDefinitionV4({
        statusComponentId,
        ...testComponentData,
      });
      await expectSnapshots(file.trimEnd(), definitionV4);
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working status component', async () => {
      generateStatusComponentFile('tool-summary', testComponentData);

      // Extract just the component definition (remove imports and export)
      const definition = generateStatusComponentDefinition('tool-summary', testComponentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const statusComponent = (config) => config;
        
        // Create chainable mock for Zod
        const createChainableMock = (type, data = {}) => ({
          type,
          ...data,
          describe: (desc) => createChainableMock(type, { ...data, description: desc }),
          optional: () => createChainableMock(type, { ...data, optional: true }),
          nullable: () => createChainableMock(type, { ...data, nullable: true }),
          default: (value) => createChainableMock(type, { ...data, default: value })
        });
        
        const z = {
          object: (props) => createChainableMock('object', { props }),
          string: () => createChainableMock('string'),
          number: () => createChainableMock('number'),
          boolean: () => createChainableMock('boolean'),
          array: (items) => createChainableMock('array', { items }),
          enum: (values) => createChainableMock('enum', { values }),
          union: (schemas) => createChainableMock('union', { schemas }),
          literal: (value) => createChainableMock('literal', { value }),
          any: () => createChainableMock('any'),
          unknown: () => createChainableMock('unknown')
        };
        
        ${definitionWithoutExport}
        
        return toolSummary;
      `;

      // Use eval to test the code compiles and runs
      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.type).toBe('tool_summary');
      expect(result.description).toBe('Summary of tool calls and their purpose');
      expect(result.detailsSchema).toBeDefined();
      expect(result.detailsSchema.type).toBe('object');
      expect(result.detailsSchema.props).toBeDefined();

      // Verify the schema structure
      const props = result.detailsSchema.props;
      expect(props.tool_name).toBeDefined();
      expect(props.tool_name.type).toBe('string');
      expect(props.purpose).toBeDefined();
      expect(props.outcome).toBeDefined();
      expect(props.success).toBeDefined();
      expect(props.success.type).toBe('boolean');
    });

    it('should generate code for status component without schema that compiles', () => {
      const simpleData = {
        type: 'simple_progress',
        description: 'A simple progress status component',
      };

      const file = generateStatusComponentFile('simple-progress', simpleData);

      // Should not include zod import
      expect(file).not.toContain('import { z }');
      expect(file).toContain('import { statusComponent }');

      // Test compilation with just the definition
      const definition = generateStatusComponentDefinition('simple-progress', simpleData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const statusComponent = (config) => config;
        
        ${definitionWithoutExport}
        
        return simpleProgress;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.type).toBe('simple_progress');
      expect(result.description).toBe('A simple progress status component');
      expect(result.detailsSchema).toBeUndefined(); // No schema provided
    });

    it('should throw error for status component without type', () => {
      const noTypeData = {
        description: 'Status component without explicit type',
      };

      expect(() => {
        generateStatusComponentDefinition('fallback-status', noTypeData);
      }).toThrow("Missing required fields for status component 'fallback-status': type");
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty component data', () => {
      expect(() => {
        generateStatusComponentDefinition('empty', {});
      }).toThrow("Missing required fields for status component 'empty': type");
    });

    // it('should handle special characters in component ID', () => {
    //   const definition = generateStatusComponentDefinition('status-update_v2', {
    //     type: 'status_update',
    //     description: 'Status Update',
    //   });
    //
    //   expect(definition).toContain('export const statusUpdateV2 = statusComponent({');
    //   expect(definition).toContain("type: 'status_update',");
    // });

    // it('should handle component ID starting with number', () => {
    //   const definition = generateStatusComponentDefinition('2023-status', {
    //     type: 'yearly_status',
    //     description: 'Status',
    //   });
    //
    //   expect(definition).toContain('export const _2023Status = statusComponent({');
    // });
  });
});
