/**
 * Unit tests for status component generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateStatusComponentDefinition,
  generateStatusComponentImports,
  generateStatusComponentFile,
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
      const imports = generateStatusComponentImports('tool-summary', testComponentData);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { z } from 'zod';");
    });

    it('should generate only statusComponent import without schema', () => {
      const dataWithoutSchema = {
        type: 'simple_status',
        description: 'Simple status component',
      };
      const imports = generateStatusComponentImports('simple', dataWithoutSchema);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk';");
    });

    it('should handle double quotes style', () => {
      const imports = generateStatusComponentImports('tool-summary', testComponentData, {
        quotes: 'double',
        semicolons: true,
        indentation: '  ',
      });

      expect(imports[0]).toBe('import { statusComponent } from "@inkeep/agents-sdk";');
      expect(imports[1]).toBe('import { z } from "zod";');
    });

    it('should handle no semicolons style', () => {
      const imports = generateStatusComponentImports('tool-summary', testComponentData, {
        quotes: 'single',
        semicolons: false,
        indentation: '  ',
      });

      expect(imports[0]).toBe("import { statusComponent } from '@inkeep/agents-sdk'");
      expect(imports[1]).toBe("import { z } from 'zod'");
    });
  });

  describe('generateStatusComponentDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateStatusComponentDefinition('tool-summary', testComponentData);

      expect(definition).toContain('export const toolSummary = statusComponent({');
      expect(definition).toContain("type: 'tool_summary',");
      expect(definition).toContain("description: 'Summary of tool calls and their purpose',");
      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('});');
    });

    it('should handle component ID to camelCase conversion', () => {
      const definition = generateStatusComponentDefinition('progress-update', {
        type: 'progress_update',
        description: 'Progress information',
      });

      expect(definition).toContain('export const progressUpdate = statusComponent({');
      expect(definition).toContain("type: 'progress_update',");
    });

    it('should throw error for missing type', () => {
      expect(() => {
        generateStatusComponentDefinition('my-status', {
          description: 'Status without explicit type',
        });
      }).toThrow("Missing required fields for status component 'my-status': type");
    });

    it('should handle components with only type', () => {
      const definition = generateStatusComponentDefinition('minimal', { type: 'minimal_status' });

      expect(definition).toContain('export const minimal = statusComponent({');
      expect(definition).toContain("type: 'minimal_status'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('detailsSchema:');
    });

    it('should handle schema field (alternative to detailsSchema)', () => {
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

      const definition = generateStatusComponentDefinition('test', dataWithSchema);

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('value');
    });

    it('should prefer detailsSchema over schema when both exist', () => {
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

      const definition = generateStatusComponentDefinition('test', dataWithBoth);

      expect(definition).toContain('details');
      expect(definition).not.toContain('schema:');
    });

    it('should handle multiline descriptions', () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information';
      const dataWithLongDesc = {
        type: 'detailed_status',
        description: longDescription,
      };

      const definition = generateStatusComponentDefinition('test', dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);
    });

    it('should handle complex nested schema', () => {
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

      const definition = generateStatusComponentDefinition('complex', complexData);

      expect(definition).toContain('detailsSchema: z.object({');
      expect(definition).toContain('metadata');
      expect(definition).toContain('items');
    });
  });

  describe('generateStatusComponentFile', () => {
    it('should generate complete file with imports and definition', () => {
      const file = generateStatusComponentFile('tool-summary', testComponentData);

      expect(file).toContain("import { statusComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('export const toolSummary = statusComponent({');
      expect(file).toContain("type: 'tool_summary',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working status component', async () => {
      const file = generateStatusComponentFile('tool-summary', testComponentData);

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
      let result;
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

      let result;
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

    it('should handle special characters in component ID', () => {
      const definition = generateStatusComponentDefinition('status-update_v2', {
        type: 'status_update',
        description: 'Status Update',
      });

      expect(definition).toContain('export const statusUpdateV2 = statusComponent({');
      expect(definition).toContain("type: 'status_update',");
    });

    it('should handle component ID starting with number', () => {
      const definition = generateStatusComponentDefinition('2023-status', {
        type: 'yearly_status',
        description: 'Status',
      });

      expect(definition).toContain('export const _2023Status = statusComponent({');
    });

    it('should handle type with special characters', () => {
      const definition = generateStatusComponentDefinition('test', {
        type: 'complex_type-with.special@chars',
        description: 'Test status',
      });

      expect(definition).toContain("type: 'complex_type-with.special@chars',");
    });
  });
});
