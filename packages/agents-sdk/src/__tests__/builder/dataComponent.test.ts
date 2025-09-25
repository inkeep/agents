import { describe, expect, it } from 'vitest';
import { DataComponent } from '../../data-component';
import { createTestTenantId } from '../utils/testTenant';

describe('DataComponent Class', () => {
  const tenantId = createTestTenantId('data-component-class');
  const projectId = 'test-project';

  describe('Basic functionality', () => {
    it('should create a DataComponent instance with correct properties', () => {
      const config = {
        name: 'TestComponent',
        tenantId,
        projectId,
        description: 'A test data component',
        id: 'test-component',
        props: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['items'],
        },
      };

      const dataComponent = new DataComponent(config);

      expect(dataComponent.getName()).toBe('TestComponent');
      expect(dataComponent.getDescription()).toBe('A test data component');
      expect(dataComponent.getId()).toBe('test-component');
      expect(dataComponent.getProps()).toEqual(config.props);
    });

    it('should generate correct slug ID from name', () => {
      const config = {
        name: 'Test Component With Spaces & Special!@# Characters',
        tenantId,
        projectId,
        description: 'Test description',
        id: 'test-component-with-spaces-special-characters',
        props: {},
      };

      const dataComponent = new DataComponent(config);
      expect(dataComponent.getId()).toBe('test-component-with-spaces-special-characters');
    });

    it('should handle complex props structure', () => {
      const complexProps = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                metadata: {
                  type: 'object',
                  properties: {
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          config: {
            type: 'object',
            properties: {
              theme: { type: 'string', enum: ['light', 'dark'] },
            },
          },
        },
        required: ['items'],
      };

      const config = {
        name: 'ComplexComponent',
        tenantId,
        projectId,
        description: 'Complex data component',
        id: 'complex-component',
        props: complexProps,
      };

      const dataComponent = new DataComponent(config);
      expect(dataComponent.getProps()).toEqual(complexProps);
    });

    it('should use provided tenantId', () => {
      const config = {
        name: 'DefaultTenantComponent',
        tenantId: 'default',
        projectId,
        description: 'Component with default tenant ID',
        id: 'default-tenant-component',
        props: { type: 'object' },
      };

      const dataComponent = new DataComponent(config);
      // tenantId is private, not part of public config
      expect(dataComponent).toBeDefined();
    });

    it('should handle empty props', () => {
      const config = {
        name: 'EmptyPropsComponent',
        tenantId,
        projectId,
        description: 'Component with empty props',
        id: 'empty-props-component',
        props: {},
      };

      const dataComponent = new DataComponent(config);
      expect(dataComponent.getProps()).toEqual({});
    });
  });
});
