// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for data component generator
 */

import { generateDataComponentDefinition as originalGenerateDataComponentDefinition } from '../../../pull-v4/data-component-generator';
import { expectSnapshots } from '../../../pull-v4/utils';

function generateDataComponentDefinition(
  ...args: Parameters<typeof originalGenerateDataComponentDefinition>
): string {
  return originalGenerateDataComponentDefinition(...args).getFullText();
}

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
                description: 'Unique task identifier',
              },
              title: {
                type: 'string',
                description: 'Task title',
              },
              completed: {
                type: 'boolean',
                description: 'Whether the task is completed',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Task priority',
              },
            },
            required: ['id', 'title', 'completed'],
          },
          description: 'Array of user tasks',
        },
        totalCount: {
          type: 'number',
          description: 'Total number of tasks',
        },
      },
      required: ['tasks', 'totalCount'],
    },
  };

  describe('generateDataComponentDefinition', () => {
    it('should generate correct definition with all properties', async () => {
      const componentId = 'task-list';
      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...testComponentData,
      });

      expect(definition).toContain('export const taskList = dataComponent({');
      expect(definition).toContain("id: 'task-list',");
      expect(definition).toContain("name: 'Task List',");
      expect(definition).toContain("description: 'Display user tasks with status',");
      expect(definition).toContain('props: z.object({');
      expect(definition).toContain('});');

      await expectSnapshots(definition);
    });

    it('should handle component ID to camelCase conversion', async () => {
      const componentId = 'user-profile-data';
      const componentData = {
        name: 'Profile',
        description: 'User profile data',
        props: { type: 'object', properties: { name: { type: 'string' } } },
      };
      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });

      expect(definition).toContain('export const userProfileData = dataComponent({');
      expect(definition).toContain("id: 'user-profile-data',");

      await expectSnapshots(definition);
    });

    it.skip('should throw error for missing required fields', () => {
      expect(() => {
        generateDataComponentDefinition('minimal', {});
      }).toThrow("Missing required fields for data component 'minimal': name, props");
    });

    it.skip('should throw error when only schema provided (needs props)', () => {
      const dataWithSchema = {
        name: 'Test',
        description: 'Test component with schema',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
        },
      };

      expect(() => {
        generateDataComponentDefinition('test', dataWithSchema);
      }).toThrow("Missing required fields for data component 'test': props");
    });

    it('should prefer props over schema when both exist', async () => {
      const componentId = 'test';
      const dataWithBoth = {
        name: 'Test',
        description: 'Test component with both props and schema',
        props: {
          type: 'object',
          properties: { prop: { type: 'string' } },
        },
        schema: {
          type: 'object',
          properties: { schema: { type: 'string' } },
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...dataWithBoth,
      });

      expect(definition).toContain('prop');
      expect(definition).not.toContain('"schema"'); // Should not contain schema property

      await expectSnapshots(definition);
    });

    it('should handle multiline descriptions', async () => {
      const componentId = 'test';
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings';
      const dataWithLongDesc = {
        name: 'Test',
        description: longDescription,
        props: { type: 'object', properties: { content: { type: 'string' } } },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...dataWithLongDesc,
      });
      expect(definition).toContain(`description: '${longDescription}'`);
      await expectSnapshots(definition);
    });
  });

  describe('generateDataComponentFile', () => {
    it('should generate complete file with imports and definition', async () => {
      const componentId = 'task-list';
      const file = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...testComponentData,
      });

      expect(file).toContain("import { dataComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('export const taskList = dataComponent({');
      expect(file).toContain("id: 'task-list',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      await expectSnapshots(file);
    });
  });

  describe('compilation tests', () => {
    it.skip('should throw error for data component without props', () => {
      const simpleData = {
        name: 'Simple Data',
        description: 'A simple data component',
      };

      expect(() => {
        generateDataComponentFile('simple-data', simpleData);
      }).toThrow("Missing required fields for data component 'simple-data': props");
    });

    it('should generate code for complex nested schema that compiles', async () => {
      const componentId = 'complex-data';
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
                name: { type: 'string' },
              },
            },
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...complexData,
      });

      expect(definition).toContain('export const complexData = dataComponent({');
      expect(definition).toContain('props: z.object({');

      await expectSnapshots(definition);
    });
  });

  describe('edge cases', () => {
    it.skip('should throw error for missing name only', () => {
      expect(() => {
        generateDataComponentDefinition('missing-name', { description: 'Test description' });
      }).toThrow("Missing required fields for data component 'missing-name': name");
    });

    it('should not throw error for missing description (now optional)', async () => {
      const componentId = 'missing-desc';
      const componentData = {
        name: 'Test Component',
        props: { type: 'object', properties: {} },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });
      await expectSnapshots(definition, definition);
    });
  });

  describe('render attribute support', () => {
    it('should generate data component with render attribute', async () => {
      const componentId = 'user-profile-card';
      const componentData = {
        name: 'User Profile Card',
        description: 'Display user profile information',
        props: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['name', 'email'],
        },
        render: {
          component:
            'function UserProfile({ name, email, role }) { return <div className="profile"><h2>{name}</h2><p>{email}</p><p>Role: {role}</p></div>; }',
          mockData: {
            name: 'John Doe',
            email: 'john@example.com',
            role: 'Developer',
          },
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });

      expect(definition).toContain('export const userProfileCard = dataComponent({');
      expect(definition).toContain("id: 'user-profile-card',");
      expect(definition).toContain("name: 'User Profile Card',");
      expect(definition).toContain('render: {');
      expect(definition).toContain("component: 'function UserProfile");
      expect(definition).toContain('mockData: {');
      expect(definition).toContain("name: 'John Doe'");
      expect(definition).toContain("email: 'john@example.com'");
      expect(definition).toContain("role: 'Developer'");

      await expectSnapshots(definition);
    });

    it('should handle data component without render attribute', async () => {
      const componentId = 'simple-data';
      const componentData = {
        name: 'Simple Data',
        description: 'Simple data without render',
        props: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });

      expect(definition).toContain('export const simpleData = dataComponent({');
      expect(definition).not.toContain('render:');
      expect(definition).not.toContain('component:');
      expect(definition).not.toContain('mockData:');

      await expectSnapshots(definition);
    });

    it('should handle render with component only (no mockData)', async () => {
      const componentId = 'component-only';
      const componentData = {
        name: 'Component Only',
        description: 'Component with render but no mock data',
        props: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        render: {
          component: 'function SimpleComponent({ message }) { return <div>{message}</div>; }',
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });

      expect(definition).toContain('export const componentOnly = dataComponent({');
      expect(definition).toContain('render: {');
      expect(definition).toContain("component: 'function SimpleComponent");
      expect(definition).not.toContain('mockData:');
      await expectSnapshots(definition);
    });

    it('should ignore invalid render attribute (missing component)', async () => {
      const componentId = 'invalid-render';
      const componentData = {
        name: 'Invalid Render',
        description: 'Component with invalid render',
        props: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
        },
        render: {
          mockData: { data: 'test' },
          // Missing component field
        },
      };

      const definition = generateDataComponentDefinition({
        dataComponentId: componentId,
        ...componentData,
      });

      expect(definition).toContain('export const invalidRender = dataComponent({');
      expect(definition).not.toContain('render:');
      expect(definition).not.toContain('component:');
      expect(definition).not.toContain('mockData:');

      await expectSnapshots(definition);
    });
  });
});
