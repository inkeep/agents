import { beforeEach, describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

const testArtifactComponents = [
  {
    id: 'comp-1',
    name: 'ResearchDoc',
    description: 'A research document',
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title', inPreview: true },
        summary: { type: 'string', description: 'Short summary', inPreview: true },
        content: { type: 'string', description: 'Full content', inPreview: false },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags',
          inPreview: false,
        },
      },
    },
  },
];

function makeArtifact(overrides: Record<string, any> = {}) {
  return {
    artifactId: 'art-1',
    name: 'My Research Doc',
    description: 'A research document artifact',
    taskId: 'task-1',
    toolCallId: 'tool-call-1',
    createdAt: '2024-01-01T00:00:00Z',
    parts: [{ kind: 'data', data: { summary: { title: 'Test', summary: 'Test summary' } } }],
    ...overrides,
  } as any;
}

describe('PromptConfig — artifact type and schema in generated XML', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;

  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  test('artifact XML includes <type> filled from artifact.type', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('<type>ResearchDoc</type>');
  });

  test('artifact XML includes <type>unknown</type> when artifact has no type', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact()],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('<type>unknown</type>');
  });

  test('type_schema shows PREVIEW and FULL sections when type matches a component', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    const typeSchemaMatch = result.prompt.match(/<type_schema>([\s\S]*?)<\/type_schema>/);
    expect(typeSchemaMatch).not.toBeNull();
    expect(typeSchemaMatch?.[1]).toContain('PREVIEW');
    expect(typeSchemaMatch?.[1]).toContain('FULL');
  });

  test('type_schema preview contains only inPreview fields', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    const typeSchemaMatch = result.prompt.match(/<type_schema>([\s\S]*?)<\/type_schema>/);
    const typeSchemaContent = typeSchemaMatch?.[1] ?? '';
    const previewIndex = typeSchemaContent.indexOf('PREVIEW');
    const fullIndex = typeSchemaContent.indexOf('FULL');
    const previewSection = typeSchemaContent.slice(previewIndex, fullIndex);
    expect(previewSection).toContain('"title"');
    expect(previewSection).toContain('"summary"');
    expect(previewSection).not.toContain('"content"');
    expect(previewSection).not.toContain('"tags"');
  });

  test('type_schema full section contains all fields', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    const typeSchemaMatch = result.prompt.match(/<type_schema>([\s\S]*?)<\/type_schema>/);
    const typeSchemaContent = typeSchemaMatch?.[1] ?? '';
    const fullIndex = typeSchemaContent.indexOf('FULL');
    const fullSection = typeSchemaContent.slice(fullIndex);
    expect(fullSection).toContain('"title"');
    expect(fullSection).toContain('"summary"');
    expect(fullSection).toContain('"content"');
    expect(fullSection).toContain('"tags"');
  });

  test('type_schema shows "Schema not available" when type is not in component map', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'UnknownType' })],
      allProjectArtifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('Schema not available');
  });

  test('uses allProjectArtifactComponents for type schema map over artifactComponents', () => {
    const differentComponents = [
      {
        id: 'comp-2',
        name: 'SpecialDoc',
        description: 'Special doc',
        props: {
          type: 'object',
          properties: {
            headline: { type: 'string', inPreview: true },
          },
        },
      },
    ];

    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'SpecialDoc' })],
      artifactComponents: testArtifactComponents,
      allProjectArtifactComponents: differentComponents,
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('<type>SpecialDoc</type>');
    expect(result.prompt).not.toContain('Schema not available');
    expect(result.prompt).toContain('"headline"');
  });

  test('falls back to artifactComponents when allProjectArtifactComponents is absent', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      artifactComponents: testArtifactComponents,
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('<type>ResearchDoc</type>');
    expect(result.prompt).not.toContain('Schema not available');
  });

  test('handles artifact with empty allProjectArtifactComponents gracefully', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [makeArtifact({ type: 'ResearchDoc' })],
      allProjectArtifactComponents: [],
    };

    const result = builder.buildSystemPrompt(config);
    expect(result.prompt).toContain('Schema not available');
  });
});
