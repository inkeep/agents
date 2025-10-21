import { describe, expect, it } from 'vitest';
import { generateArtifactComponentFile, DEFAULT_CODE_STYLE } from '../artifact-component-generator';

describe('artifact-component-generator', () => {
  describe('generateArtifactComponentFile', () => {
    it('should generate a basic artifact component file', () => {
      const componentData = {
        id: 'document-template',
        name: 'Document Template',
        description: 'A template for generating documents',
        type: 'document',
        template: 'This is a template for {{title}} with {{content}}',
        props: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Document title'
            },
            content: {
              type: 'string',
              description: 'Document content'
            }
          }
        },
        config: {
          format: 'markdown',
          maxLength: 5000
        }
      };

      const result = generateArtifactComponentFile('document-template', componentData);

      expect(result).toContain("import { artifactComponent } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("export const documentTemplate = artifactComponent({");
      expect(result).toContain("id: 'document-template',");
      expect(result).toContain("name: 'Document Template',");
      expect(result).toContain("description: 'A template for generating documents',");
      expect(result).toContain("type: 'document',");
      expect(result).toContain("template: 'This is a template for {{title}} with {{content}}',");
      expect(result).toContain("props: z.object({");
      expect(result).toContain("title: z.string().describe(`Document title`),");
      expect(result).toContain("content: z.string().describe(`Document content`),");
      expect(result).toContain("config: {");
      expect(result).toContain("format: 'markdown',");
      expect(result).toContain("maxLength: 5000,");
    });

    it('should handle artifact component without optional fields', () => {
      const componentData = {
        id: 'simple-artifact',
        name: 'Simple Artifact'
      };

      const result = generateArtifactComponentFile('simple-artifact', componentData);

      expect(result).toContain("import { artifactComponent } from '@inkeep/agents-sdk';");
      expect(result).not.toContain("import { z } from 'zod';");
      expect(result).toContain("export const simpleArtifact = artifactComponent({");
      expect(result).toContain("id: 'simple-artifact',");
      expect(result).toContain("name: 'Simple Artifact',");
      expect(result).not.toContain("description:");
      expect(result).not.toContain("type:");
      expect(result).not.toContain("template:");
      expect(result).not.toContain("props:");
      expect(result).not.toContain("config:");
    });

    it('should handle multiline templates', () => {
      const componentData = {
        id: 'long-template',
        name: 'Long Template',
        template: `# {{title}}

This is a very long template that spans multiple lines
and contains various sections:

## Content
{{content}}

## Footer
Generated on {{date}}`
      };

      const result = generateArtifactComponentFile('long-template', componentData);

      expect(result).toContain("template: `# {{title}}");
      expect(result).toContain("This is a very long template");
      expect(result).toContain("Generated on {{date}}`,");
    });

    it('should handle complex config objects', () => {
      const componentData = {
        id: 'complex-config',
        name: 'Complex Config',
        config: {
          output: {
            format: 'html',
            styling: {
              theme: 'dark',
              fontSize: 14
            }
          },
          features: ['syntax-highlighting', 'line-numbers'],
          enabled: true
        }
      };

      const result = generateArtifactComponentFile('complex-config', componentData);

      expect(result).toContain("config: {");
      expect(result).toContain("output: {");
      expect(result).toContain("format: 'html',");
      expect(result).toContain("styling: {");
      expect(result).toContain("theme: 'dark',");
      expect(result).toContain("fontSize: 14,");
      expect(result).toContain("features: [");
      expect(result).toContain("'syntax-highlighting',");
      expect(result).toContain("'line-numbers',");
      expect(result).toContain("enabled: true,");
    });

    it('should use schema field if props is not available', () => {
      const componentData = {
        id: 'alt-schema',
        name: 'Alt Schema',
        schema: {
          type: 'object',
          properties: {
            data: {
              type: 'string'
            }
          }
        }
      };

      const result = generateArtifactComponentFile('alt-schema', componentData);

      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("props: z.object({");
      expect(result).toContain("data: z.string(),");
    });

    it('should use double quotes when configured', () => {
      const componentData = {
        id: 'test-artifact',
        name: 'Test Artifact',
        type: 'test'
      };

      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateArtifactComponentFile('test-artifact', componentData, style);

      expect(result).toContain('import { artifactComponent } from "@inkeep/agents-sdk";');
      expect(result).toContain('name: "Test Artifact",');
      expect(result).toContain('type: "test",');
    });

    it('should handle different ID formats', () => {
      expect(generateArtifactComponentFile('code-generator', { name: 'Test' }))
        .toContain('export const codeGenerator =');
      
      expect(generateArtifactComponentFile('code_generator', { name: 'Test' }))
        .toContain('export const codeGenerator =');
      
      expect(generateArtifactComponentFile('CodeGenerator', { name: 'Test' }))
        .toContain('export const codegenerator =');
    });

    it('should handle array config values', () => {
      const componentData = {
        id: 'array-config',
        name: 'Array Config',
        config: {
          tags: ['tag1', 'tag2'],
          numbers: [1, 2, 3],
          objects: [
            { name: 'item1', value: 10 },
            { name: 'item2', value: 20 }
          ]
        }
      };

      const result = generateArtifactComponentFile('array-config', componentData);

      expect(result).toContain("tags: [");
      expect(result).toContain("'tag1',");
      expect(result).toContain("'tag2',");
      expect(result).toContain("numbers: [");
      expect(result).toContain("1,");
      expect(result).toContain("2,");
      expect(result).toContain("3,");
      expect(result).toContain("objects: [");
      expect(result).toContain("name: 'item1',");
      expect(result).toContain("value: 10,");
    });
  });
});