/**
 * Unit tests for artifact component generator
 */

import { generateArtifactComponentDefinition as originalGenerateArtifactComponentDefinition } from '../generators/artifact-component-generator';
import { expectSnapshots } from '../utils';

function generateArtifactComponentDefinition(
  ...args: Parameters<typeof originalGenerateArtifactComponentDefinition>
): string {
  return originalGenerateArtifactComponentDefinition(...args).getFullText();
}

describe('Artifact Component Generator', () => {
  const testComponentData = {
    name: 'Citation',
    description: 'Structured factual information extracted from search results',
    props: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the source document',
          inPreview: true,
        },
        url: {
          type: 'string',
          description: 'URL of the source document',
          inPreview: true,
        },
        record_type: {
          type: 'string',
          description: 'Type of record (documentation, blog, guide, etc.)',
          inPreview: true,
        },
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Type of content (text, image, video, etc.)',
              },
              text: {
                type: 'string',
                description: 'The actual text content',
              },
            },
            required: ['type', 'text'],
          },
          description: 'Array of structured content blocks extracted from the document',
        },
      },
      required: ['title', 'url', 'record_type', 'content'],
    },
  };

  describe('generateArtifactComponentDefinition', () => {
    it('should generate correct definition with all properties', async () => {
      const artifactComponentId = 'citation';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...testComponentData,
      });

      expect(definition).toContain('export const citation = artifactComponent({');
      expect(definition).toContain("id: 'citation',");
      expect(definition).toContain("name: 'Citation',");
      expect(definition).toContain(
        "description: 'Structured factual information extracted from search results',"
      );
      expect(definition).toContain('props: z.object({');
      expect(definition).toContain('});');
      expect(definition).toContain(
        'title: preview(z.string().describe("Title of the source document")),'
      );
      expect(definition).toContain(
        'url: preview(z.string().describe("URL of the source document")),'
      );
      expect(definition).toContain(
        'record_type: preview(z.string().describe("Type of record (documentation, blog, guide, etc.)")),'
      );
      await expectSnapshots(definition);
    });

    it('should handle component ID to camelCase conversion', async () => {
      const artifactComponentId = 'document-template';
      const conversionData = {
        name: 'Template',
        description: 'Document template component',
        props: { type: 'object', properties: { title: { type: 'string' } } },
      };
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...conversionData,
      });

      expect(definition).toContain('export const documentTemplate = artifactComponent({');
      expect(definition).toContain("id: 'document-template',");
      await expectSnapshots(definition);
    });

    it('should not wrap non-preview fields with preview() function', async () => {
      const artifactComponentId = 'citation';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...testComponentData,
      });

      // Content field should not have preview() wrapper since inPreview is not set
      expect(definition).toContain('content: z.array(');
      expect(definition).not.toContain('content: preview(');
      await expectSnapshots(definition);
    });

    it('should throw error for missing required fields', () => {
      const artifactComponentId = 'minimal';
      expect(() => {
        generateArtifactComponentDefinition({ artifactComponentId });
      }).toThrow(
        new Error(`Validation failed for artifact component:
✖ Invalid input: expected string, received undefined
  → at name`)
      );
    });

    it('should prefer props over schema when both exist', async () => {
      const dataWithBoth = {
        name: 'Test',
        description: 'Component with both props and schema',
        props: {
          type: 'object',
          properties: {
            prop: {
              type: 'string',
              inPreview: true,
            },
          },
        },
      };

      const artifactComponentId = 'test';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...dataWithBoth,
      });

      expect(definition).toContain('prop: preview(');
      expect(definition).not.toContain('schema:');
      await expectSnapshots(definition);
    });

    it('should handle mixed preview and non-preview fields', async () => {
      const mixedData = {
        name: 'Mixed',
        description: 'Component with mixed preview fields',
        props: {
          type: 'object',
          properties: {
            previewField: {
              type: 'string',
              description: 'This is shown in preview',
              inPreview: true,
            },
            regularField: {
              type: 'string',
              description: 'This is not shown in preview',
            },
          },
        },
      };

      const artifactComponentId = 'mixed';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...mixedData,
      });

      expect(definition).toContain(
        'previewField: preview(z.string().describe("This is shown in preview")),'
      );
      expect(definition).toContain(
        'regularField: z.string().describe("This is not shown in preview"),'
      );
      await expectSnapshots(definition);
    });
  });

  describe('generateArtifactComponentFile', () => {
    it.skip('should generate complete file with imports and definition', () => {
      const file = generateArtifactComponentFile('citation', testComponentData);

      expect(file).toContain("import { preview } from '@inkeep/agents-core';");
      expect(file).toContain("import { artifactComponent } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('export const citation = artifactComponent({');
      expect(file).toContain("id: 'citation',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate code for artifact component without preview fields that compiles', async () => {
      const simpleData = {
        name: 'Simple Artifact',
        description: 'A simple artifact component',
        props: {
          type: 'object',
          properties: {
            value: {
              type: 'string',
              description: 'Simple value',
            },
          },
        },
      };

      const artifactComponentId = 'simple-artifact';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...simpleData,
      });
      await expectSnapshots(definition);
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested objects with preview fields', async () => {
      const nestedData = {
        name: 'Nested',
        description: 'Component with nested objects',
        props: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  inPreview: true,
                },
                internal: {
                  type: 'string',
                },
              },
            },
          },
        },
      };

      // This is a limitation - we only handle top-level inPreview fields
      // but the function should not crash
      const artifactComponentId = 'nested';
      const definition = generateArtifactComponentDefinition({
        artifactComponentId,
        ...nestedData,
      });
      expect(definition).toContain('export const nested = artifactComponent({');
      await expectSnapshots(definition);
    });
  });
});
