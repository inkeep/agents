import { beforeEach, describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

describe('PromptConfig Token Counting', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;

  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  describe('Artifact Token Counting', () => {
    test('should have zero artifactsSection tokens when no artifacts exist', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.breakdown.components.artifactsSection).toBe(0);
    });

    test('should have artifactsSection tokens only for actual artifact XML content', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [
          {
            artifactId: 'test-artifact-1',
            name: 'Test Documentation',
            description: 'Test artifact for documentation',
            taskId: 'task-1',
            toolCallId: 'tool-call-1',
            createdAt: '2024-01-01T00:00:00Z',
            parts: [
              {
                kind: 'data',
                data: { summary: { title: 'Test Doc', content: 'Test content' } },
              },
            ],
          },
        ],
        hasAgentArtifactComponents: true,
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.breakdown.components.artifactsSection).toBeGreaterThan(0);
      expect(result.prompt).toContain('<name>Test Documentation</name>');
      expect(result.prompt).toContain('<artifact_id>test-artifact-1</artifact_id>');
    });

    test('should include artifact instructions in systemPromptTemplate, not artifactsSection', () => {
      const configWithoutArtifacts: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        hasAgentArtifactComponents: true,
      };

      const resultWithoutArtifacts = builder.buildSystemPrompt(configWithoutArtifacts);

      expect(resultWithoutArtifacts.breakdown.components.artifactsSection).toBe(0);
      expect(resultWithoutArtifacts.breakdown.components.systemPromptTemplate).toBeGreaterThan(0);
      expect(resultWithoutArtifacts.prompt).toContain('<available_artifacts');
      expect(resultWithoutArtifacts.prompt).toContain('ARTIFACT');
    });

    test('should count artifact component instructions separately', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        artifactComponents: [
          {
            id: 'test-artifact-component',
            name: 'TestArtifact',
            description: 'A test artifact type',
            props: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'The title', inPreview: true },
                content: { type: 'string', description: 'The content', inPreview: false },
              },
            },
          },
        ],
        hasAgentArtifactComponents: true,
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.breakdown.components.artifactsSection).toBe(0);
      expect(result.breakdown.components.artifactComponents).toBeGreaterThan(0);
      expect(result.breakdown.components.systemPromptTemplate).toBeGreaterThan(0);
    });

    test('should have consistent total tokens regardless of artifact count', () => {
      const baseConfig: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        hasAgentArtifactComponents: true,
      };

      const configWithArtifact: SystemPromptV1 = {
        ...baseConfig,
        artifacts: [
          {
            artifactId: 'test-artifact-1',
            name: 'Test Doc',
            description: 'Test description',
            taskId: 'task-1',
            toolCallId: 'tool-call-1',
            createdAt: '2024-01-01T00:00:00Z',
            parts: [{ kind: 'data', data: { summary: { title: 'Test' } } }],
          },
        ],
      };

      const resultWithout = builder.buildSystemPrompt(baseConfig);
      const resultWith = builder.buildSystemPrompt(configWithArtifact);

      const artifactXmlTokens = resultWith.breakdown.components.artifactsSection;
      const expectedDifference = artifactXmlTokens;

      expect(resultWith.breakdown.total - resultWithout.breakdown.total).toBeCloseTo(
        expectedDifference,
        -1
      );
    });

    test('should have multiple artifacts counted correctly', () => {
      const configSingleArtifact: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [
          {
            artifactId: 'artifact-1',
            name: 'First Doc',
            description: 'First description',
            taskId: 'task-1',
            toolCallId: 'tool-call-1',
            createdAt: '2024-01-01T00:00:00Z',
            parts: [{ kind: 'data', data: { summary: { title: 'First' } } }],
          },
        ],
        hasAgentArtifactComponents: true,
      };

      const configTwoArtifacts: SystemPromptV1 = {
        ...configSingleArtifact,
        artifacts: [
          ...configSingleArtifact.artifacts,
          {
            artifactId: 'artifact-2',
            name: 'Second Doc',
            description: 'Second description',
            taskId: 'task-2',
            toolCallId: 'tool-call-2',
            createdAt: '2024-01-01T00:00:00Z',
            parts: [{ kind: 'data', data: { summary: { title: 'Second' } } }],
          },
        ],
      };

      const resultSingle = builder.buildSystemPrompt(configSingleArtifact);
      const resultDouble = builder.buildSystemPrompt(configTwoArtifacts);

      expect(resultDouble.breakdown.components.artifactsSection).toBeGreaterThan(
        resultSingle.breakdown.components.artifactsSection
      );
      expect(resultDouble.breakdown.components.systemPromptTemplate).toBe(
        resultSingle.breakdown.components.systemPromptTemplate
      );
    });

    test('should not count artifact boilerplate when hasAgentArtifactComponents is false and no artifacts', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a simple assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        hasAgentArtifactComponents: false,
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.breakdown.components.artifactsSection).toBe(0);
      expect(result.prompt).not.toContain('ARTIFACT RETRIEVAL');
    });
  });
});
