import { describe, expect, it } from 'vitest';
import { artifactComponent } from '../../builderFunctions';
import type { ArtifactComponentConfig } from '../../builders';

describe('artifactComponent builder function', () => {
  it('should create an artifact component with basic config', () => {
    const config: ArtifactComponentConfig = {
      name: 'Test Artifact',
      description: 'Test artifact component',
      props: {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
        },
      },
    };

    const component = artifactComponent(config);

    expect(component.getName()).toBe('Test Artifact');
    expect(component.getDescription()).toBe('Test artifact component');
    expect(component.getId()).toBe('test-artifact');
  });

  it('should handle complex props structure', () => {
    const config: ArtifactComponentConfig = {
      name: 'Complex Artifact',
      description: 'Artifact with complex props',
      props: {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          metadata: {
            type: 'object',
            inPreview: true,
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              version: { type: 'string' },
            },
          },
          content: { type: 'string', inPreview: false },
          sections: {
            type: 'array',
            inPreview: false,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const component = artifactComponent(config);

    expect(component.getName()).toBe('Complex Artifact');
    expect(component.getProps()).toEqual(config.props);
  });

  it('should generate correct slug ID from name', () => {
    const config: ArtifactComponentConfig = {
      name: 'Artifact Component With Spaces & Special!@# Characters',
      description: 'Test description',
      props: {},
    };

    const component = artifactComponent(config);
    expect(component.getId()).toBe('artifact-component-with-spaces-special-characters');
  });

  it('should allow setting tenant and project context', () => {
    const config: ArtifactComponentConfig = {
      name: 'Default Tenant Artifact',
      description: 'Artifact without tenant',
      props: {},
    };

    const component = artifactComponent(config);
    // Should be able to set context after creation
    component.setContext('test-tenant', 'test-project');
    // Verify the component can be created without tenantId/projectId
    expect(component.getId()).toBeDefined();
  });
});
