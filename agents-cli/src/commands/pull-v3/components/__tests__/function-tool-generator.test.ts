/**
 * Unit tests for function tool generator
 */

import { describe, expect, it } from 'vitest';
import {
  generateFunctionToolDefinition,
  generateFunctionToolFile,
  generateFunctionToolImports,
} from '../function-tool-generator';

describe('Function Tool Generator', () => {
  const testToolData = {
    name: 'calculate-bmi',
    description: 'Calculate BMI and health category',
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Weight in kilograms' },
        height: { type: 'number', description: 'Height in meters' },
      },
      required: ['weight', 'height'],
    },
    executeCode: `async ({ weight, height }) => {
  const bmi = weight / (height * height);
  let category = 'Normal';
  if (bmi < 18.5) category = 'Underweight';
  else if (bmi >= 30) category = 'Obese';

  return { bmi: Math.round(bmi * 10) / 10, category };
}`,
  };

  describe('generateFunctionToolImports', () => {
    it('should generate correct imports', () => {
      const imports = generateFunctionToolImports('calculate-bmi', testToolData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { functionTool } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateFunctionToolImports('calculate-bmi', testToolData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    ',
      });

      expect(imports[0]).toBe('import { functionTool } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateFunctionToolDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateFunctionToolDefinition('calculate-bmi', testToolData);

      expect(definition).toContain('export const calculateBmi = functionTool({');
      expect(definition).toContain("name: 'calculate-bmi',");
      expect(definition).toContain("description: 'Calculate BMI and health category',");
      expect(definition).toContain('inputSchema: {');
      expect(definition).toContain('execute: async ({ weight, height }) => {');
      expect(definition).toContain('});');
    });

    it('should handle tool ID to camelCase conversion', () => {
      const definition = generateFunctionToolDefinition('email-sender-tool', {
        name: 'email-sender',
        description: 'Send emails',
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'return { sent: true };',
      });

      expect(definition).toContain('export const emailSenderTool = functionTool({');
      expect(definition).toContain("name: 'email-sender',");
    });

    it('should throw error for missing name', () => {
      expect(() => {
        generateFunctionToolDefinition('my-tool', {
          description: 'Tool without explicit name',
          executeCode: 'return {};',
        });
      }).toThrow("Missing required fields for function tool 'my-tool': name");
    });

    it('should throw error for missing executeCode/execute', () => {
      expect(() => {
        generateFunctionToolDefinition('minimal', { name: 'minimal-tool' });
      }).toThrow("Missing required fields for function tool 'minimal': inputSchema, executeCode");
    });

    it('should throw error when only schema provided (needs inputSchema)', () => {
      const dataWithSchema = {
        name: 'test-tool',
        description: 'Test tool',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'Input value' },
          },
        },
        executeCode: 'return { result: "test" };',
      };

      expect(() => {
        generateFunctionToolDefinition('test', dataWithSchema);
      }).toThrow("Missing required fields for function tool 'test': inputSchema");
    });

    it('should prefer inputSchema over schema when both exist', () => {
      const dataWithBoth = {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input field' },
          },
        },
        schema: {
          type: 'object',
          properties: {
            schema: { type: 'string', description: 'Schema field' },
          },
        },
        executeCode: 'return { success: true };',
      };

      const definition = generateFunctionToolDefinition('test', dataWithBoth);

      expect(definition).toContain('"input"');
      expect(definition).not.toContain('"schema"');
    });

    it('should handle multiline descriptions', () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information about the function tool';
      const dataWithLongDesc = {
        name: 'detailed-tool',
        description: longDescription,
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'return { processed: true };',
      };

      const definition = generateFunctionToolDefinition('test', dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);
    });

    it('should format execute function with proper indentation', () => {
      const simpleExecute = `async ({ value }) => {
  return { result: value * 2 };
}`;

      const toolData = {
        name: 'multiply-tool',
        inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
        executeCode: simpleExecute,
      };

      const definition = generateFunctionToolDefinition('multiply', toolData);

      expect(definition).toContain('execute: async ({ value }) => {');
      expect(definition).toContain('  return { result: value * 2 };');
      expect(definition).toContain('  }');
    });

    it('should handle execute as simple code block', () => {
      const toolData = {
        name: 'simple-tool',
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'return { message: "Hello World" };',
      };

      const definition = generateFunctionToolDefinition('simple', toolData);

      expect(definition).toContain('execute: async ({}) => {');
      expect(definition).toContain('return { message: "Hello World" };');
    });

    it('should throw error when no executeCode is provided', () => {
      const toolData = {
        name: 'no-execute-tool',
        description: 'Tool without execute function',
      };

      expect(() => {
        generateFunctionToolDefinition('no-execute', toolData);
      }).toThrow(
        "Missing required fields for function tool 'no-execute': inputSchema, executeCode"
      );
    });

    it('should handle complex input schema', () => {
      const complexData = {
        name: 'complex-tool',
        description: 'Complex tool with nested schema',
        inputSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'User ID' },
                preferences: {
                  type: 'object',
                  properties: {
                    theme: { type: 'string', enum: ['light', 'dark'] },
                    notifications: { type: 'boolean' },
                  },
                },
              },
              required: ['id'],
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: 'number' },
                },
              },
            },
          },
          required: ['user'],
        },
        executeCode: 'return { processed: true };',
      };

      const definition = generateFunctionToolDefinition('complex', complexData);

      expect(definition).toContain('inputSchema: {');
      expect(definition).toContain('"user"');
      expect(definition).toContain('"items"');
      expect(definition).toContain('"preferences"');
    });
  });

  describe('generateFunctionToolFile', () => {
    it('should generate complete file with imports and definition', () => {
      const file = generateFunctionToolFile('calculate-bmi', testToolData);

      expect(file).toContain("import { functionTool } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const calculateBmi = functionTool({');
      expect(file).toContain("name: 'calculate-bmi',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working function tool', async () => {
      const file = generateFunctionToolFile('calculate-bmi', testToolData);

      // Extract just the tool definition (remove imports and export)
      const definition = generateFunctionToolDefinition('calculate-bmi', testToolData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const functionTool = (config) => config;
        
        ${definitionWithoutExport}
        
        return calculateBmi;
      `;

      // Use eval to test the code compiles and runs
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.name).toBe('calculate-bmi');
      expect(result.description).toBe('Calculate BMI and health category');
      expect(result.inputSchema).toBeDefined();
      expect(result.inputSchema.type).toBe('object');
      expect(result.inputSchema.properties).toBeDefined();
      expect(result.execute).toBeDefined();
      expect(typeof result.execute).toBe('function');

      // Verify the input schema structure
      const props = result.inputSchema.properties;
      expect(props.weight).toBeDefined();
      expect(props.weight.type).toBe('number');
      expect(props.height).toBeDefined();
      expect(props.height.type).toBe('number');

      // Test the execute function works
      const executeResult = await result.execute({ weight: 70, height: 1.75 });
      expect(executeResult).toBeDefined();
      expect(executeResult.bmi).toBeDefined();
      expect(executeResult.category).toBeDefined();
    });

    it('should throw error for function tool without schema', () => {
      const simpleData = {
        name: 'simple-greeting',
        description: 'A simple greeting function tool',
        executeCode:
          'async ({ name }) => { return { message: `Hello ${name ? name : "World"}!` }; }',
      };

      expect(() => {
        generateFunctionToolDefinition('simple-greeting', simpleData);
      }).toThrow("Missing required fields for function tool 'simple-greeting': inputSchema");
    });

    it('should throw error for function tool with no executeCode', () => {
      const noExecuteData = {
        name: 'placeholder-tool',
        description: 'Tool without execute function',
      };

      expect(() => {
        generateFunctionToolDefinition('placeholder-tool', noExecuteData);
      }).toThrow(
        "Missing required fields for function tool 'placeholder-tool': inputSchema, executeCode"
      );
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty tool data', () => {
      expect(() => {
        generateFunctionToolDefinition('empty', {});
      }).toThrow(
        "Missing required fields for function tool 'empty': name, inputSchema, executeCode"
      );
    });

    it('should handle special characters in tool ID', () => {
      const definition = generateFunctionToolDefinition('email-tool_v2', {
        name: 'email-tool',
        description: 'Email Tool',
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'return { sent: true };',
      });

      expect(definition).toContain('export const emailToolV2 = functionTool({');
      expect(definition).toContain("name: 'email-tool',");
    });

    it('should handle tool ID starting with number', () => {
      const definition = generateFunctionToolDefinition('2023-calculator', {
        name: 'calculator',
        description: 'Calculator tool',
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'return { result: 42 };',
      });

      expect(definition).toContain('export const _2023Calculator = functionTool({');
    });

    it('should handle malformed execute function gracefully', () => {
      const toolData = {
        name: 'bad-execute-tool',
        inputSchema: { type: 'object', properties: {} },
        executeCode: 'not a valid function',
      };

      const definition = generateFunctionToolDefinition('bad-execute', toolData);

      // Should wrap the bad code in a function
      expect(definition).toContain('execute: async ({}) => {');
      expect(definition).toContain('not a valid function');
    });

    it('should throw error for missing executeCode only', () => {
      const missingExecuteData = {
        name: 'missing-execute-tool',
      };

      expect(() => {
        generateFunctionToolDefinition('missing-execute-tool', missingExecuteData);
      }).toThrow(
        "Missing required fields for function tool 'missing-execute-tool': inputSchema, executeCode"
      );
    });

    it('should throw error for missing name and executeCode', () => {
      const missingBothData = {
        description: 'Tool with description only',
      };

      expect(() => {
        generateFunctionToolDefinition('missing-both-tool', missingBothData);
      }).toThrow(
        "Missing required fields for function tool 'missing-both-tool': name, inputSchema, executeCode"
      );
    });
  });
});
