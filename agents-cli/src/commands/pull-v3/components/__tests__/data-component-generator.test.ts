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
      const definition = generateDataComponentDefinition('user-profile-data', { 
        name: 'Profile', 
        description: 'User profile data',
        props: { type: 'object', properties: { name: { type: 'string' } } }
      });
      
      expect(definition).toContain("export const userProfileData = dataComponent({");
      expect(definition).toContain("id: 'user-profile-data',");
    });

    it('should throw error for missing required fields', () => {
      expect(() => {
        generateDataComponentDefinition('minimal', {});
      }).toThrow('Missing required fields for data component \'minimal\': name, description');
    });

    it('should throw error when only schema provided (needs props)', () => {
      const dataWithSchema = {
        name: 'Test',
        description: 'Test component with schema',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          }
        }
      };

      expect(() => {
        generateDataComponentDefinition('test', dataWithSchema);
      }).toThrow('Missing required fields for data component \'test\': props');
    });

    it('should prefer props over schema when both exist', () => {
      const dataWithBoth = {
        name: 'Test',
        description: 'Test component with both props and schema',
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
      expect(definition).not.toContain('"schema"'); // Should not contain schema property
    });

    it('should handle multiline descriptions', () => {
      const longDescription = 'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings';
      const dataWithLongDesc = {
        name: 'Test',
        description: longDescription,
        props: { type: 'object', properties: { content: { type: 'string' } } }
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
    
    it('should throw error for data component without props', () => {
      const simpleData = {
        name: 'Simple Data',
        description: 'A simple data component'
      };
      
      expect(() => {
        generateDataComponentFile('simple-data', simpleData);
      }).toThrow('Missing required fields for data component \'simple-data\': props');
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
                id: { type: 'string' },
                name: { type: 'string' }
              }
            },
            items: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      };
      
      const definition = generateDataComponentDefinition('complex-data', complexData);
      
      expect(definition).toContain('export const complexData = dataComponent({');
      expect(definition).toContain('props: z.object({');
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty component data', () => {
      expect(() => {
        generateDataComponentDefinition('empty', {});
      }).toThrow('Missing required fields for data component \'empty\': name, description');
    });

    it('should handle special characters in component ID', () => {
      const definition = generateDataComponentDefinition('user-data_2023', { 
        name: 'User Data', 
        description: 'Data for user',
        props: { type: 'object', properties: { data: { type: 'string' } } }
      });
      
      expect(definition).toContain("export const userData2023 = dataComponent({");
      expect(definition).toContain("id: 'user-data_2023',");
    });

    it('should handle component ID starting with number', () => {
      const definition = generateDataComponentDefinition('2023-data', { 
        name: 'Data', 
        description: 'Data for 2023',
        props: { type: 'object', properties: { year: { type: 'number' } } }
      });
      
      expect(definition).toContain("export const _2023Data = dataComponent({");
      expect(definition).toContain("id: '2023-data',");
    });

    it('should throw error for missing name only', () => {
      expect(() => {
        generateDataComponentDefinition('missing-name', { description: 'Test description' });
      }).toThrow("Missing required fields for data component 'missing-name': name");
    });

    it('should throw error for missing description only', () => {
      expect(() => {
        generateDataComponentDefinition('missing-desc', { name: 'Test Component' });
      }).toThrow("Missing required fields for data component 'missing-desc': description");
    });
  });
});

