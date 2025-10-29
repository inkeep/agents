/**
 * Unit tests for data component generator
 */

import { describe, it, expect } from 'vitest';
import { 
  generateDataComponentDefinition,
  generateDataComponentImports,
  generateDataComponentFile
} from '../data-component-generator';

describe('Data Component Generator', () => {
  const testComponentData = {
    name: 'Task List',
    description: 'Display user tasks with status',
    props: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique task identifier'
              },
              title: {
                type: 'string', 
                description: 'Task title'
              },
              completed: {
                type: 'boolean',
                description: 'Whether the task is completed'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Task priority'
              }
            },
            required: ['id', 'title', 'completed']
          },
          description: 'Array of user tasks'
        },
        totalCount: {
          type: 'number',
          description: 'Total number of tasks'
        }
      },
      required: ['tasks', 'totalCount']
    }
  };

  describe('generateDataComponentImports', () => {
    it('should generate correct imports with schema', () => {
      const imports = generateDataComponentImports('task-list', testComponentData);
      
      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { dataComponent } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { z } from 'zod';");
    });

    it('should generate only dataComponent import without schema', () => {
      const dataWithoutSchema = { name: 'Simple', description: 'Simple component' };
      const imports = generateDataComponentImports('simple', dataWithoutSchema);
      
      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { dataComponent } from '@inkeep/agents-sdk';");
    });

    it('should handle double quotes style', () => {
      const imports = generateDataComponentImports('task-list', testComponentData, {
        quotes: 'double',
        semicolons: true,
        indentation: '  '
      });
      
      expect(imports[0]).toBe('import { dataComponent } from "@inkeep/agents-sdk";');
      expect(imports[1]).toBe('import { z } from "zod";');
    });

    it('should handle no semicolons style', () => {
      const imports = generateDataComponentImports('task-list', testComponentData, {
        quotes: 'single',
        semicolons: false,
        indentation: '  '
      });
      
      expect(imports[0]).toBe("import { dataComponent } from '@inkeep/agents-sdk'");
      expect(imports[1]).toBe("import { z } from 'zod'");
    });
  });

  describe('generateDataComponentDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateDataComponentDefinition('task-list', testComponentData);
      
      expect(definition).toContain("export const taskList = dataComponent({");
      expect(definition).toContain("id: 'task-list',");
      expect(definition).toContain("name: 'Task List',");
      expect(definition).toContain("description: 'Display user tasks with status',");
      expect(definition).toContain("props: z.object({");
      expect(definition).toContain("});");
    });

    it('should handle component ID to camelCase conversion', () => {
      const definition = generateDataComponentDefinition('user-profile-data', { name: 'Profile' });
      
      expect(definition).toContain("export const userProfileData = dataComponent({");
      expect(definition).toContain("id: 'user-profile-data',");
    });

    it('should handle components with only id', () => {
      const definition = generateDataComponentDefinition('minimal', {});
      
      expect(definition).toContain("export const minimal = dataComponent({");
      expect(definition).toContain("id: 'minimal'");
      expect(definition).not.toContain("name:");
      expect(definition).not.toContain("description:");
      expect(definition).not.toContain("props:");
    });

    it('should handle schema field (alternative to props)', () => {
      const dataWithSchema = {
        name: 'Test',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          }
        }
      };

      const definition = generateDataComponentDefinition('test', dataWithSchema);
      
      expect(definition).toContain("props: z.object({");
      expect(definition).toContain("value");
    });

    it('should prefer props over schema when both exist', () => {
      const dataWithBoth = {
        name: 'Test',
        props: {
          type: 'object',
          properties: { prop: { type: 'string' } }
        },
        schema: {
          type: 'object', 
          properties: { schema: { type: 'string' } }
        }
      };

      const definition = generateDataComponentDefinition('test', dataWithBoth);
      
      expect(definition).toContain("prop");
      expect(definition).not.toContain("schema");
    });

    it('should handle multiline descriptions', () => {
      const longDescription = 'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings';
      const dataWithLongDesc = {
        name: 'Test',
        description: longDescription
      };

      const definition = generateDataComponentDefinition('test', dataWithLongDesc);
      
      expect(definition).toContain(`description: \`${longDescription}\``);
    });
  });

  describe('generateDataComponentFile', () => {
    it('should generate complete file with imports and definition', () => {
      const file = generateDataComponentFile('task-list', testComponentData);
      
      expect(file).toContain("import { dataComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain("export const taskList = dataComponent({");
      expect(file).toContain("id: 'task-list',");
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working data component', async () => {
      const file = generateDataComponentFile('task-list', testComponentData);
      
      // Extract just the component definition (remove imports and export)
      const definition = generateDataComponentDefinition('task-list', testComponentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const dataComponent = (config) => config;
        
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
        
        return taskList;
      `;
      
      // Use eval to test the code compiles and runs
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`)
      }).not.toThrow();
      
      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.id).toBe('task-list');
      expect(result.name).toBe('Task List');
      expect(result.description).toBe('Display user tasks with status');
      expect(result.props).toBeDefined();
      expect(result.props.type).toBe('object');
      expect(result.props.props).toBeDefined();
      
      // Verify the props structure
      const props = result.props.props;
      expect(props.tasks).toBeDefined();
      expect(props.tasks.type).toBe('array');
      expect(props.totalCount).toBeDefined();
      expect(props.totalCount.type).toBe('number');
    });
    
    it('should generate code for data component without schema that compiles', () => {
      const simpleData = {
        name: 'Simple Data',
        description: 'A simple data component'
      };
      
      const file = generateDataComponentFile('simple-data', simpleData);
      
      // Should not include zod import
      expect(file).not.toContain("import { z }");
      expect(file).toContain("import { dataComponent }");
      
      // Test compilation with just the definition
      const definition = generateDataComponentDefinition('simple-data', simpleData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const dataComponent = (config) => config;
        
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
        
        return simpleData;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`)
      }).not.toThrow();
      
      expect(result.id).toBe('simple-data');
      expect(result.name).toBe('Simple Data');
      expect(result.description).toBe('A simple data component');
      expect(result.props).toBeUndefined(); // No schema provided
    });

    it('should generate code for complex nested schema that compiles', () => {
      const complexData = {
        name: 'Complex Data',
        description: 'A data component with nested objects and arrays',
        props: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'User ID' },
                profile: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Full name' },
                    age: { type: 'number', description: 'Age in years' }
                  },
                  required: ['name']
                }
              },
              required: ['id', 'profile']
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of tags'
            }
          },
          required: ['user']
        }
      };

      const definition = generateDataComponentDefinition('complex-data', complexData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const dataComponent = (config) => config;
        
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
        
        return complexData;
      `;

      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`)
      }).not.toThrow();

      expect(result.id).toBe('complex-data');
      expect(result.name).toBe('Complex Data');
      expect(result.props.props.user).toBeDefined();
      expect(result.props.props.tags).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty component data', () => {
      const definition = generateDataComponentDefinition('empty', {});
      
      expect(definition).toBe("export const empty = dataComponent({\n  id: 'empty'\n});");
    });

    it('should handle special characters in component ID', () => {
      const definition = generateDataComponentDefinition('user-data_2023', { name: 'User Data' });
      
      expect(definition).toContain("export const userData2023 = dataComponent({");
      expect(definition).toContain("id: 'user-data_2023',");
    });

    it('should handle component ID starting with number', () => {
      const definition = generateDataComponentDefinition('2023-data', { name: 'Data' });
      
      expect(definition).toContain("export const _2023Data = dataComponent({");
    });
  });
});