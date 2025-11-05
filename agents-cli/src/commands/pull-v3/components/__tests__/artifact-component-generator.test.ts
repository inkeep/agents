/**
 * Unit tests for artifact component generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateArtifactComponentDefinition,
  generateArtifactComponentImports,
  generateArtifactComponentFile,
} from '../artifact-component-generator';

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

  describe('generateArtifactComponentImports', () => {
    it('should generate correct imports with preview fields', () => {
      const imports = generateArtifactComponentImports('citation', testComponentData);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toBe("import { preview } from '@inkeep/agents-core';");
      expect(imports[1]).toBe("import { artifactComponent } from '@inkeep/agents-sdk';");
      expect(imports[2]).toBe("import { z } from 'zod';");
    });

    it('should generate imports without preview when no preview fields', () => {
      const dataWithoutPreview = {
        name: 'Simple',
        description: 'Simple artifact component',
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

      const imports = generateArtifactComponentImports('simple', dataWithoutPreview);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { artifactComponent } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { z } from 'zod';");
      expect(imports).not.toContain(expect.stringContaining('preview'));
    });

    it('should generate only artifactComponent import without schema', () => {
      const dataWithoutSchema = { name: 'Simple', description: 'Simple component' };
      const imports = generateArtifactComponentImports('simple', dataWithoutSchema);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { artifactComponent } from '@inkeep/agents-sdk';");
    });

    it('should handle double quotes style', () => {
      const imports = generateArtifactComponentImports('citation', testComponentData, {
        quotes: 'double',
        semicolons: true,
        indentation: '  ',
      });

      expect(imports[0]).toBe('import { preview } from "@inkeep/agents-core";');
      expect(imports[1]).toBe('import { artifactComponent } from "@inkeep/agents-sdk";');
      expect(imports[2]).toBe('import { z } from "zod";');
    });

    it('should handle no semicolons style', () => {
      const imports = generateArtifactComponentImports('citation', testComponentData, {
        quotes: 'single',
        semicolons: false,
        indentation: '  ',
      });

      expect(imports[0]).toBe("import { preview } from '@inkeep/agents-core'");
      expect(imports[1]).toBe("import { artifactComponent } from '@inkeep/agents-sdk'");
      expect(imports[2]).toBe("import { z } from 'zod'");
    });
  });

  describe('generateArtifactComponentDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateArtifactComponentDefinition('citation', testComponentData);

      expect(definition).toContain('export const citation = artifactComponent({');
      expect(definition).toContain("id: 'citation',");
      expect(definition).toContain("name: 'Citation',");
      expect(definition).toContain(
        "description: 'Structured factual information extracted from search results',"
      );
      expect(definition).toContain('props: z.object({');
      expect(definition).toContain('});');
    });

    it('should handle component ID to camelCase conversion', () => {
      const definition = generateArtifactComponentDefinition('document-template', {
        name: 'Template',
        description: 'Document template component',
        props: { type: 'object', properties: { title: { type: 'string' } } },
      });

      expect(definition).toContain('export const documentTemplate = artifactComponent({');
      expect(definition).toContain("id: 'document-template',");
    });

    it('should wrap preview fields with preview() function', () => {
      const definition = generateArtifactComponentDefinition('citation', testComponentData);

      expect(definition).toContain(
        'title: preview(z.string().describe("Title of the source document")),'
      );
      expect(definition).toContain(
        'url: preview(z.string().describe("URL of the source document")),'
      );
      expect(definition).toContain(
        'record_type: preview(z.string().describe("Type of record (documentation, blog, guide, etc.)")),'
      );
    });

    it('should not wrap non-preview fields with preview() function', () => {
      const definition = generateArtifactComponentDefinition('citation', testComponentData);

      // Content field should not have preview() wrapper since inPreview is not set
      expect(definition).toContain('content: z.array(');
      expect(definition).not.toContain('content: preview(');
    });

    it('should throw error for missing required fields', () => {
      expect(() => {
        generateArtifactComponentDefinition('minimal', {});
      }).toThrow(
        "Missing required fields for artifact component 'minimal': name, description, props"
      );
    });

    it('should handle template property', () => {
      const dataWithTemplate = {
        name: 'Test',
        description: 'Template component',
        props: { type: 'object', properties: { title: { type: 'string' } } },
        template: '<div>{{title}}</div>',
      };

      const definition = generateArtifactComponentDefinition('test', dataWithTemplate);

      expect(definition).toContain("template: '<div>{{title}}</div>'");
    });

    it('should handle contentType property', () => {
      const dataWithContentType = {
        name: 'Test',
        description: 'Component with content type',
        props: { type: 'object', properties: { content: { type: 'string' } } },
        contentType: 'text/html',
      };

      const definition = generateArtifactComponentDefinition('test', dataWithContentType);

      expect(definition).toContain("contentType: 'text/html'");
    });

    it('should handle multiline template with template literals', () => {
      const longTemplate = `<div class="citation">
  <h3>{{title}}</h3>
  <a href="{{url}}">{{url}}</a>
  <div>{{content}}</div>
</div>`;

      const dataWithLongTemplate = {
        name: 'Test',
        description: 'Component with multiline template',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            content: { type: 'string' },
          },
        },
        template: longTemplate,
      };

      const definition = generateArtifactComponentDefinition('test', dataWithLongTemplate);

      expect(definition).toContain(`template: \`${longTemplate}\``);
    });

    it('should throw error when only schema provided (needs props)', () => {
      const dataWithSchema = {
        name: 'Test',
        schema: {
          type: 'object',
          properties: {
            value: {
              type: 'string',
              inPreview: true,
            },
          },
        },
      };

      expect(() => {
        generateArtifactComponentDefinition('test', dataWithSchema);
      }).toThrow("Missing required fields for artifact component 'test': description, props");
    });

    it('should prefer props over schema when both exist', () => {
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
        schema: {
          type: 'object',
          properties: {
            schema: {
              type: 'string',
              inPreview: false,
            },
          },
        },
      };

      const definition = generateArtifactComponentDefinition('test', dataWithBoth);

      expect(definition).toContain('prop: preview(');
      expect(definition).not.toContain('schema:');
    });

    it('should handle mixed preview and non-preview fields', () => {
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

      const definition = generateArtifactComponentDefinition('mixed', mixedData);

      expect(definition).toContain(
        'previewField: preview(z.string().describe("This is shown in preview")),'
      );
      expect(definition).toContain(
        'regularField: z.string().describe("This is not shown in preview"),'
      );
    });
  });

  describe('generateArtifactComponentFile', () => {
    it('should generate complete file with imports and definition', () => {
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
    it('should generate code that compiles and creates a working artifact component', async () => {
      const file = generateArtifactComponentFile('citation', testComponentData);

      // Extract just the component definition (remove imports and export)
      const definition = generateArtifactComponentDefinition('citation', testComponentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const preview = (schema) => ({ isPreview: true, schema });
        const artifactComponent = (config) => config;
        const z = {
          object: (props) => ({ type: 'object', props }),
          string: () => ({ type: 'string', describe: (desc) => ({ type: 'string', description: desc }) }),
          array: (items) => ({ type: 'array', items, describe: (desc) => ({ type: 'array', items, description: desc }) }),
          describe: function(desc) { return { ...this, description: desc }; }
        };
        
        ${definitionWithoutExport}
        
        return citation;
      `;

      // Use eval to test the code compiles and runs
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.id).toBe('citation');
      expect(result.name).toBe('Citation');
      expect(result.description).toBe(
        'Structured factual information extracted from search results'
      );
      expect(result.props).toBeDefined();
      expect(result.props.type).toBe('object');
      expect(result.props.props).toBeDefined();

      // Verify preview fields are wrapped correctly
      const props = result.props.props;
      expect(props.title.isPreview).toBe(true);
      expect(props.url.isPreview).toBe(true);
      expect(props.record_type.isPreview).toBe(true);
      expect(props.content.isPreview).toBeUndefined(); // Should not be preview
    });

    it('should generate code for artifact component without preview fields that compiles', () => {
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

      const file = generateArtifactComponentFile('simple-artifact', simpleData);

      // Should not include preview import
      expect(file).not.toContain('import { preview }');
      expect(file).toContain('import { artifactComponent }');
      expect(file).toContain('import { z }');

      // Test compilation with just the definition (strip export)
      const definition = generateArtifactComponentDefinition('simple-artifact', simpleData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const artifactComponent = (config) => config;
        const z = {
          object: (props) => ({ type: 'object', props }),
          string: () => ({ type: 'string', describe: (desc) => ({ type: 'string', description: desc }) })
        };
        
        ${definitionWithoutExport}
        
        return simpleArtifact;
      `;

      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.id).toBe('simple-artifact');
      expect(result.name).toBe('Simple Artifact');
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty component data', () => {
      expect(() => {
        generateArtifactComponentDefinition('empty', {});
      }).toThrow(
        "Missing required fields for artifact component 'empty': name, description, props"
      );
    });

    it('should handle special characters in component ID', () => {
      const definition = generateArtifactComponentDefinition('user-artifact_2023', {
        name: 'User Artifact',
        description: 'Component with special chars',
        props: { type: 'object', properties: {} },
      });

      expect(definition).toContain('export const userArtifact2023 = artifactComponent({');
      expect(definition).toContain("id: 'user-artifact_2023',");
    });

    it('should handle component ID starting with number', () => {
      const definition = generateArtifactComponentDefinition('2023-artifact', {
        name: 'Artifact',
        description: 'Component starting with number',
        props: { type: 'object', properties: {} },
      });

      expect(definition).toContain('export const _2023Artifact = artifactComponent({');
    });

    it('should handle deeply nested objects with preview fields', () => {
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
      const definition = generateArtifactComponentDefinition('nested', nestedData);
      expect(definition).toContain('export const nested = artifactComponent({');
    });
  });
});
