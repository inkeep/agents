import { describe, expect, it } from 'vitest';
import { artifactComponent } from '../../builderFunctions';
import type { ArtifactComponentConfig } from '../../builders';

describe('artifactComponent builder function', () => {
  it('should create an artifact component with basic config', () => {
    const config: ArtifactComponentConfig = {
      name: 'Test Artifact',
      description: 'Test artifact component',
      summaryProps: { title: 'Summary' },
      fullProps: { content: 'Full content' },
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
      tenantId: 'test-tenant',
      projectId: 'test-project',
      summaryProps: {
        title: 'Complex Summary',
        metadata: {
          tags: ['test', 'artifact'],
          version: '1.0.0',
        },
      },
      fullProps: {
        content: 'Detailed content',
        sections: [
          { title: 'Section 1', body: 'Content 1' },
          { title: 'Section 2', body: 'Content 2' },
        ],
        config: {
          theme: 'light',
          readonly: false,
        },
      },
    };

    const component = artifactComponent(config);

    expect(component.getName()).toBe('Complex Artifact');
    expect(component.config.tenantId).toBe('test-tenant');
    expect(component.config.projectId).toBe('test-project');
    expect(component.getSummaryProps()).toEqual(config.summaryProps);
    expect(component.getFullProps()).toEqual(config.fullProps);
  });

  it('should generate correct slug ID from name', () => {
    const config: ArtifactComponentConfig = {
      name: 'Artifact Component With Spaces & Special!@# Characters',
      description: 'Test description',
      summaryProps: {},
      fullProps: {},
    };

    const component = artifactComponent(config);
    expect(component.getId()).toBe('artifact-component-with-spaces-special-characters');
  });

  it('should allow setting tenant and project context', () => {
    const config: ArtifactComponentConfig = {
      name: 'Default Tenant Artifact',
      description: 'Artifact without tenant',
      summaryProps: {},
      fullProps: {},
    };

    const component = artifactComponent(config);
    // Should be able to set context after creation
    component.setContext('test-tenant', 'test-project');
    // Verify the component can be created without tenantId/projectId
    expect(component.getId()).toBeDefined();
  });
});
