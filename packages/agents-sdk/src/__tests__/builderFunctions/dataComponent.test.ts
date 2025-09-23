import { describe, expect, it } from 'vitest';
import { dataComponent } from '../../builderFunctions';
import type { DataComponentConfig } from '../../builders';

describe('dataComponent builder function', () => {
  it('should create a data component with basic config', () => {
    const config: DataComponentConfig = {
      name: 'Test Data Component',
      description: 'Test data component',
      props: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    };

    const component = dataComponent(config);

    expect(component.getName()).toBe('Test Data Component');
    expect(component.getDescription()).toBe('Test data component');
    expect(component.getId()).toBe('test-data-component');
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
                  priority: { type: 'number', minimum: 1, maximum: 5 },
                },
              },
            },
            required: ['id', 'name'],
          },
        },
        config: {
          type: 'object',
          properties: {
            theme: { type: 'string', enum: ['light', 'dark'] },
            pageSize: { type: 'number', default: 10 },
          },
        },
      },
      required: ['items'],
    };

    const config: DataComponentConfig = {
      name: 'Complex Data Component',
      description: 'Data component with complex structure',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      props: complexProps,
    };

    const component = dataComponent(config);

    expect(component.getName()).toBe('Complex Data Component');
    expect(component.config.tenantId).toBe('test-tenant');
    expect(component.config.projectId).toBe('test-project');
    expect(component.getProps()).toEqual(complexProps);
  });

  it('should generate correct slug ID from name', () => {
    const config: DataComponentConfig = {
      name: 'Data Component With Spaces & Special!@# Characters',
      description: 'Test description',
      props: { type: 'object' },
    };

    const component = dataComponent(config);
    expect(component.getId()).toBe('data-component-with-spaces-special-characters');
  });

  it('should allow setting tenant and project context', () => {
    const config: DataComponentConfig = {
      name: 'Default Tenant Data Component',
      description: 'Data component without tenant',
      props: { type: 'object' },
    };

    const component = dataComponent(config);
    // Should be able to set context after creation
    component.setContext('test-tenant', 'test-project');
    // Verify the component can be created without tenantId/projectId
    expect(component.getId()).toBeDefined();
  });

  it('should handle empty props', () => {
    const config: DataComponentConfig = {
      name: 'Empty Props Component',
      description: 'Component with empty props',
      props: {},
    };

    const component = dataComponent(config);
    expect(component.getProps()).toEqual({});
  });
});
