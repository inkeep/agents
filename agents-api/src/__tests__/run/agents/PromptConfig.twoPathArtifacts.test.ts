import type { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

const artifactComponents: ArtifactComponentApiInsert[] = [
  {
    id: 'comp-1',
    name: 'Citation',
    description: 'A citation',
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title', inPreview: true },
        url: { type: 'string', description: 'URL', inPreview: false },
      },
    },
  },
];

function baseConfig(overrides: Partial<SystemPromptV1>): SystemPromptV1 {
  return {
    corePrompt: 'You are a helpful assistant.',
    tools: [],
    dataComponents: [],
    artifacts: [],
    artifactComponents,
    hasAgentArtifactComponents: true,
    ...overrides,
  };
}

describe('PromptConfig — two-path artifact emission (structured vs text)', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;
  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  test('T1: structured mode teaches NO <artifact:*> tag syntax', () => {
    const { prompt } = builder.buildSystemPrompt(
      baseConfig({
        dataComponents: [
          {
            id: 'dc1',
            name: 'Answer',
            description: 'An answer',
            props: { type: 'object', properties: { text: { type: 'string' } } },
          } as any,
        ],
        includeDataComponents: true,
        hasStructuredOutput: true,
      })
    );
    expect(prompt).not.toContain('artifact:create');
    expect(prompt).not.toContain('artifact:ref');
  });

  test('T2: structured mode describes the structured artifact components', () => {
    const { prompt } = builder.buildSystemPrompt(
      baseConfig({ includeDataComponents: true, hasStructuredOutput: true })
    );
    expect(prompt).toContain('structured data components');
    expect(prompt).toContain('ArtifactCreate_');
    // Citation discipline must be carried (D8).
    expect(prompt.toLowerCase()).toContain('tool_call_id');
  });

  test('T3: text mode (no structured output) STILL teaches the <artifact:*> tags (no regression)', () => {
    const { prompt } = builder.buildSystemPrompt(baseConfig({ hasStructuredOutput: false }));
    expect(prompt).toContain('artifact:create');
    expect(prompt).toContain('artifact:ref');
  });

  test('T4: structured mode carries the JMESPath selector craft (tag-free)', () => {
    const { prompt } = builder.buildSystemPrompt(
      baseConfig({
        dataComponents: [
          {
            id: 'dc1',
            name: 'Answer',
            description: 'An answer',
            props: { type: 'object', properties: { text: { type: 'string' } } },
          } as any,
        ],
        includeDataComponents: true,
        hasStructuredOutput: true,
      })
    );
    // The high-value selector craft must be present in structured mode...
    expect(prompt).toContain('FORBIDDEN JMESPATH PATTERNS');
    expect(prompt).toContain('COMMON FAILURE POINTS');
    expect(prompt).toContain('_structureHints.exampleSelectors');
    expect(prompt).toContain('SELECTOR CRAFT');
    // ...but still without any XML tag syntax bleeding in.
    expect(prompt).not.toContain('artifact:create');
    expect(prompt).not.toContain('artifact:ref');
  });

  test('T5: allowText:false artifact-only (structured, no data components) teaches structured, not tags', () => {
    const { prompt } = builder.buildSystemPrompt(
      baseConfig({
        dataComponents: [],
        includeDataComponents: false,
        hasStructuredOutput: true, // G1 true via allowText:false + artifacts
      })
    );
    expect(prompt).not.toContain('artifact:create');
    expect(prompt).not.toContain('artifact:ref');
    expect(prompt).toContain('structured data components');
  });
});
