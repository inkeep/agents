import { describe, expect, it } from 'vitest';
import { deriveToolTitle, fillMissingToolTitles } from '../../domains/mcp/mcpToolTitles';

type ToolRegistry = Record<
  string,
  { title?: string; description?: string; annotations?: { title?: string; readOnlyHint?: boolean } }
>;

describe('deriveToolTitle', () => {
  it('uses the first line of the description (the OpenAPI operation summary)', () => {
    expect(
      deriveToolTitle('health-health', 'Health check\n\nCheck if the service is healthy')
    ).toBe('Health check');
  });

  it('trims the summary line', () => {
    expect(deriveToolTitle('x', '  Get server capabilities  \n\nmore')).toBe(
      'Get server capabilities'
    );
  });

  it('falls back to the tool name when the description is absent or empty', () => {
    expect(deriveToolTitle('projects-list-projects')).toBe('projects-list-projects');
    expect(deriveToolTitle('projects-list-projects', '')).toBe('projects-list-projects');
  });
});

describe('fillMissingToolTitles', () => {
  it('fills the top-level title and annotations.title from the description', () => {
    const registry: ToolRegistry = {
      'health-health': {
        description: 'Health check\n\nmore',
        annotations: { title: '' },
      },
      'projects-list-projects': {
        description: 'List projects',
        annotations: { title: '', readOnlyHint: true },
      },
    };
    const mcpServer = { server: { _registeredTools: registry } };

    fillMissingToolTitles(mcpServer);

    expect(registry['health-health']?.title).toBe('Health check');
    expect(registry['health-health']?.annotations?.title).toBe('Health check');
    expect(registry['projects-list-projects']?.title).toBe('List projects');
    expect(registry['projects-list-projects']?.annotations?.title).toBe('List projects');
  });

  it('does not overwrite an existing title', () => {
    const registry: ToolRegistry = {
      x: { title: 'Existing', description: 'Other', annotations: { title: 'Keep' } },
    };
    const mcpServer = { server: { _registeredTools: registry } };

    fillMissingToolTitles(mcpServer);

    expect(registry.x?.title).toBe('Existing');
    expect(registry.x?.annotations?.title).toBe('Keep');
  });

  it('no-ops without throwing when the SDK tool registry is absent', () => {
    expect(() => fillMissingToolTitles({})).not.toThrow();
    expect(() => fillMissingToolTitles({ server: {} })).not.toThrow();
  });
});
