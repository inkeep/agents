import { describe, expect, it } from 'vitest';
import {
  cleanGeneratedCode,
  getTypeDefinitions,
  IMPORT_INSTRUCTIONS,
  NAMING_CONVENTION_RULES,
  PROJECT_JSON_EXAMPLE,
} from '../../utils/codegen-helpers';

describe('codegen-helpers', () => {
  describe('NAMING_CONVENTION_RULES', () => {
    it('should be a non-empty string', () => {
      expect(typeof NAMING_CONVENTION_RULES).toBe('string');
      expect(NAMING_CONVENTION_RULES.length).toBeGreaterThan(0);
    });

    it('should contain key naming patterns', () => {
      expect(NAMING_CONVENTION_RULES).toContain('camelCase');
      expect(NAMING_CONVENTION_RULES).toContain('inkeep_facts');
      expect(NAMING_CONVENTION_RULES).toContain('inkeepFacts');
      expect(NAMING_CONVENTION_RULES).toContain('weather-api');
      expect(NAMING_CONVENTION_RULES).toContain('weatherApi');
    });

    it('should include examples for different resource types', () => {
      expect(NAMING_CONVENTION_RULES).toContain('Tool:');
      expect(NAMING_CONVENTION_RULES).toContain('Component:');
      expect(NAMING_CONVENTION_RULES).toContain('Agent:');
    });
  });

  describe('IMPORT_INSTRUCTIONS', () => {
    it('should be a non-empty string', () => {
      expect(typeof IMPORT_INSTRUCTIONS).toBe('string');
      expect(IMPORT_INSTRUCTIONS.length).toBeGreaterThan(0);
    });

    it('should contain import path patterns', () => {
      expect(IMPORT_INSTRUCTIONS).toContain('../tools/');
      expect(IMPORT_INSTRUCTIONS).toContain('../data-components/');
      expect(IMPORT_INSTRUCTIONS).toContain('../artifact-components/');
      expect(IMPORT_INSTRUCTIONS).toContain('./agent/');
    });

    it('should warn against barrel imports', () => {
      expect(IMPORT_INSTRUCTIONS).toContain('NEVER use barrel imports');
      expect(IMPORT_INSTRUCTIONS).toContain('❌ WRONG:');
      expect(IMPORT_INSTRUCTIONS).toContain('✅ CORRECT:');
    });

    it('should mention alphabetical sorting', () => {
      expect(IMPORT_INSTRUCTIONS).toContain('alphabetically sorted');
    });
  });

  describe('PROJECT_JSON_EXAMPLE', () => {
    it('should be a non-empty string', () => {
      expect(typeof PROJECT_JSON_EXAMPLE).toBe('string');
      expect(PROJECT_JSON_EXAMPLE.length).toBeGreaterThan(0);
    });

    it('should contain valid JSON structure markers', () => {
      expect(PROJECT_JSON_EXAMPLE).toContain('---START OF PROJECT JSON EXAMPLE---');
      expect(PROJECT_JSON_EXAMPLE).toContain('---END OF PROJECT JSON EXAMPLE---');
    });

    it('should include key project properties', () => {
      expect(PROJECT_JSON_EXAMPLE).toContain('"id"');
      expect(PROJECT_JSON_EXAMPLE).toContain('"name"');
      expect(PROJECT_JSON_EXAMPLE).toContain('"models"');
      expect(PROJECT_JSON_EXAMPLE).toContain('"agent"');
    });

    it('should include model examples', () => {
      expect(PROJECT_JSON_EXAMPLE).toContain('base');
      expect(PROJECT_JSON_EXAMPLE).toContain('structuredOutput');
      expect(PROJECT_JSON_EXAMPLE).toContain('summarizer');
    });

    it('should include component examples', () => {
      expect(PROJECT_JSON_EXAMPLE).toContain('dataComponents');
      expect(PROJECT_JSON_EXAMPLE).toContain('tools');
      expect(PROJECT_JSON_EXAMPLE).toContain('artifactComponents');
    });
  });

  describe('cleanGeneratedCode', () => {
    it('should remove typescript markdown code fences', () => {
      const input = '```typescript\nconst x = 1;\n```';
      const expected = 'const x = 1;';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should remove ts markdown code fences', () => {
      const input = '```ts\nconst x = 1;\n```';
      const expected = 'const x = 1;';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should remove plain markdown code fences', () => {
      const input = '```\nconst x = 1;\n```';
      const expected = 'const x = 1;';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should trim whitespace', () => {
      const input = '\n\n  const x = 1;  \n\n';
      const expected = 'const x = 1;';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should handle code without fences', () => {
      const input = 'const x = 1;';
      const expected = 'const x = 1;';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should handle multi-line code', () => {
      const input = `\`\`\`typescript
const x = 1;
const y = 2;
const z = x + y;
\`\`\``;
      const expected = `const x = 1;
const y = 2;
const z = x + y;`;
      expect(cleanGeneratedCode(input)).toBe(expected);
    });

    it('should handle code with markdown fence but no language', () => {
      const input = '```\nimport { agent } from "@inkeep/agents-sdk";\n```';
      const expected = 'import { agent } from "@inkeep/agents-sdk";';
      expect(cleanGeneratedCode(input)).toBe(expected);
    });
  });

  describe('getTypeDefinitions', () => {
    it('should return a non-empty string', () => {
      const result = getTypeDefinitions();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should contain type definition markers', () => {
      const result = getTypeDefinitions();
      expect(result).toContain('TYPESCRIPT TYPE DEFINITIONS');
      expect(result).toContain('@inkeep/agents-sdk');
    });

    it('should contain type definition boundaries or fallback', () => {
      const result = getTypeDefinitions();
      const hasTypeDefinitions =
        result.includes('---START OF TYPE DEFINITIONS---') &&
        result.includes('---END OF TYPE DEFINITIONS---');
      const hasFallback = result.includes(
        'Type definitions from @inkeep/agents-sdk could not be loaded'
      );

      expect(hasTypeDefinitions || hasFallback).toBe(true);
    });

    it('should attempt to load actual type definitions in normal conditions', () => {
      const result = getTypeDefinitions();

      if (result.includes('---START OF TYPE DEFINITIONS---')) {
        expect(result).toContain('---END OF TYPE DEFINITIONS---');
      }
    });
  });
});
