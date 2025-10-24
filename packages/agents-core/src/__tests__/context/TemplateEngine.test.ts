import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { type TemplateContext, TemplateEngine } from '../../context/TemplateEngine';

describe('TemplateEngine', () => {
  const sampleContext: TemplateContext = {
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      profile: {
        role: 'admin',
        permissions: ['read', 'write', 'delete'],
      },
    },
    organization: {
      name: 'Inkeep',
      id: 'org-123',
      settings: {
        timezone: 'UTC',
        features: {
          analytics: true,
          notifications: false,
        },
      },
    },
    metadata: {
      version: '1.0.0',
      environment: 'production',
      tags: ['urgent', 'customer-facing'],
    },
  };

  describe('Basic Template Variable Processing', () => {
    test('should render simple property access', () => {
      const template = 'Hello {{user.name}}!';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Hello John Doe!');
    });

    test('should render nested property access', () => {
      const template = 'Role: {{user.profile.role}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Role: admin');
    });

    test('should render multiple variables in same template', () => {
      const template = '{{user.name}} ({{user.email}}) works at {{organization.name}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('John Doe (john@example.com) works at Inkeep');
    });

    test('should handle array access with JMESPath', () => {
      const template = 'First permission: {{user.profile.permissions[0]}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('First permission: read');
    });

    test('should handle object serialization for complex values', () => {
      const template = 'Permissions: {{user.profile.permissions}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Permissions: ["read","write","delete"]');
    });
  });

  describe('Built-in Variables', () => {
    let originalEnv: string | undefined;

    beforeAll(() => {
      originalEnv = process.env.TEST_VAR;
      process.env.TEST_VAR = 'test-value';
    });

    afterAll(() => {
      if (originalEnv !== undefined) {
        process.env.TEST_VAR = originalEnv;
      } else {
        delete process.env.TEST_VAR;
      }
    });

    test('should render environment variables', () => {
      const template = 'Test var: {{$env.TEST_VAR}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Test var: test-value');
    });

    test('should handle missing environment variables', () => {
      const template = 'Missing var: {{$env.NONEXISTENT_VAR}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Missing var: ');
    });

    test('should handle unknown built-in variables', () => {
      const template = 'Unknown: {{$unknown}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Unknown: ');
    });
  });

  describe('JMESPath Expressions', () => {
    test('should handle JMESPath filtering', () => {
      const context = {
        items: [
          { name: 'item1', active: true },
          { name: 'item2', active: false },
          { name: 'item3', active: true },
        ],
      };

      const template = 'Active items: {{items[?active].name}}';
      const result = TemplateEngine.render(template, context);
      expect(result).toBe('Active items: ["item1","item3"]');
    });

    test('should handle JMESPath projections', () => {
      const template = 'All permissions: {{user.profile.permissions[*]}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('All permissions: ["read","write","delete"]');
    });

    test('should handle JMESPath functions', () => {
      const template = 'Permission count: {{length(user.profile.permissions)}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Permission count: 3');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing variables in non-strict mode', () => {
      const template = 'Missing: {{nonexistent.property}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Missing: ');
    });

    test('should throw error for missing variables in strict mode', () => {
      const template = 'Missing: {{nonexistent.property}}';
      expect(() => {
        TemplateEngine.render(template, sampleContext, { strict: true });
      }).toThrow("Template variable 'nonexistent.property' not found in context");
    });

    test('should preserve unresolved variables when preserveUnresolved is true', () => {
      const template = 'Missing: {{nonexistent.property}}';
      const result = TemplateEngine.render(template, sampleContext, {
        preserveUnresolved: true,
      });
      expect(result).toBe('Missing: {{nonexistent.property}}');
    });

    test('should handle malformed JMESPath expressions gracefully', () => {
      const template = 'Invalid: {{user..invalid..path}}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Invalid: ');
    });

    test('should handle invalid JMESPath syntax in strict mode', () => {
      const template = 'Invalid: {{user..invalid..path}}';
      expect(() => {
        TemplateEngine.render(template, sampleContext, { strict: true });
      }).toThrow();
    });
  });

  describe('Template Validation', () => {
    test('should validate correct template syntax', () => {
      const template = 'Hello {{user.name}} from {{organization.name}}!';
      const validation = TemplateEngine.validateTemplate(template);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should detect unbalanced braces', () => {
      const template = 'Hello {{user.name} from {{organization.name}}!';
      const validation = TemplateEngine.validateTemplate(template);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Unbalanced template braces: 2 opening, 1 closing');
    });

    test('should detect nested template syntax', () => {
      const template = 'Hello {{user.{{nested}}}}!';
      const validation = TemplateEngine.validateTemplate(template);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((error) => error.includes('Nested template syntax'))).toBe(
        true
      );
    });

    test('should handle empty template', () => {
      const validation = TemplateEngine.validateTemplate('');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('should handle template with no variables', () => {
      const template = 'This is just plain text with no variables.';
      const validation = TemplateEngine.validateTemplate(template);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('Variable Extraction', () => {
    test('should extract all variables from template', () => {
      const template = 'Hello {{user.name}} from {{organization.name}}!';
      const preview = TemplateEngine.preview(template, sampleContext);

      expect(preview.variables).toEqual(['user.name', 'organization.name']);
    });

    test('should remove duplicate variables', () => {
      const template = '{{user.name}} said hello to {{user.name}} again!';
      const preview = TemplateEngine.preview(template, sampleContext);

      expect(preview.variables).toEqual(['user.name']);
    });

    test('should handle template with no variables', () => {
      const template = 'This has no template variables.';
      const preview = TemplateEngine.preview(template, sampleContext);

      expect(preview.variables).toEqual([]);
    });
  });

  describe('Template Preview', () => {
    test('should preview successful rendering', () => {
      const template = 'Hello {{user.name}}!';
      const preview = TemplateEngine.preview(template, sampleContext);

      expect(preview.rendered).toBe('Hello John Doe!');
      expect(preview.variables).toEqual(['user.name']);
      expect(preview.errors).toEqual([]);
    });

    test('should preview with errors', () => {
      const template = 'Hello {{user.name}}!';
      const preview = TemplateEngine.preview(template, sampleContext, { strict: true });

      expect(preview.rendered).toBe('Hello John Doe!');
      expect(preview.errors).toEqual([]);
    });

    test('should capture rendering errors in preview', () => {
      const template = 'Hello {{nonexistent.property}}!';
      const preview = TemplateEngine.preview(template, sampleContext, { strict: true });

      expect(preview.rendered).toBe(template); // Returns original on error
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0]).toContain('not found in context');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty context', () => {
      const template = 'Hello {{user.name}}!';
      const result = TemplateEngine.render(template, {});
      expect(result).toBe('Hello !');
    });

    test('should handle null and undefined values', () => {
      const context = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroNumber: 0,
        falseBoolean: false,
      };

      const template =
        'Values: {{nullValue}}, {{undefinedValue}}, {{emptyString}}, {{zeroNumber}}, {{falseBoolean}}';
      const result = TemplateEngine.render(template, context);
      expect(result).toBe('Values: , , , 0, false');
    });

    test('should handle special characters in property names', () => {
      const context = {
        'special-key': 'special-value',
        'key with spaces': 'spaced value',
      };

      const template = 'Special: {{"special-key"}}';
      const result = TemplateEngine.render(template, context);
      expect(result).toBe('Special: special-value');
    });

    test('should handle very long templates', () => {
      const longTemplate = 'Hello {{user.name}}! '.repeat(1000);
      const result = TemplateEngine.render(longTemplate, sampleContext);
      expect(result).toBe('Hello John Doe! '.repeat(1000));
    });

    test('should handle templates with only whitespace in variables', () => {
      const template = 'Empty: {{   }}';
      const result = TemplateEngine.render(template, sampleContext);
      expect(result).toBe('Empty: ');
    });
  });

  describe('Performance', () => {
    test('should handle many variables efficiently', () => {
      const manyVarsTemplate = Array.from({ length: 100 }, (_, i) => `{{user.name}}_${i}`).join(
        ' '
      );

      const start = Date.now();
      const result = TemplateEngine.render(manyVarsTemplate, sampleContext);
      const duration = Date.now() - start;

      expect(result).toContain('John Doe');
      expect(duration).toBeLessThan(500); // Should complete in under 500ms (increased for slower systems)
    });

    test('should handle repeated rendering efficiently', () => {
      const template = 'Hello {{user.name}} from {{organization.name}}!';

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        TemplateEngine.render(template, sampleContext);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // 1000 renders in under 1 second
    });
  });
});
