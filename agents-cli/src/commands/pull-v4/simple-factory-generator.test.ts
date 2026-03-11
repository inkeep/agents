import { SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  generateFactorySourceFile,
  generateSimpleFactoryDefinition,
  generateValidatedSourceFile,
  validateGeneratorInput,
} from './simple-factory-generator';

describe('generateSimpleFactoryDefinition', () => {
  it('validates arbitrary generator inputs', () => {
    const parsed = validateGeneratorInput('development', {
      schema: z.string().nonempty(),
      errorLabel: 'environment name',
    });

    expect(parsed).toBe('development');
  });

  it('supports validated source file rendering', () => {
    const file = generateValidatedSourceFile(
      {
        message: 'hello',
      },
      {
        schema: z.strictObject({
          message: z.string().nonempty(),
        }),
        importName: 'contextConfig',
        render(parsed) {
          return generateFactorySourceFile(parsed, {
            schema: z.strictObject({
              message: z.string().nonempty(),
            }),
            factory: {
              importName: 'credential',
              variableName: () => 'validatedSourceFile',
            },
            render({ configObject }) {
              configObject.addPropertyAssignment({
                name: 'message',
                initializer: JSON.stringify(parsed.message),
              });
            },
          });
        },
      }
    );

    expect(file.getFullText()).toContain('message: "hello"');
  });

  it('supports custom factory rendering', () => {
    const file = generateFactorySourceFile(
      {
        name: 'custom',
        enabled: true,
      },
      {
        schema: z.strictObject({
          name: z.string().nonempty(),
          enabled: z.boolean(),
        }),
        factory: {
          importName: 'credential',
          variableName: (parsed) => parsed.name,
        },
        render({ parsed, configObject }) {
          configObject.addPropertyAssignment({
            name: 'enabled',
            initializer: String(parsed.enabled),
          });
        },
      }
    );

    expect(file.getFullText()).toContain('export const custom = credential({');
    expect(file.getFullText()).toContain('enabled: true');
  });

  it('writes a recursive config object', () => {
    const schema = z.strictObject({
      id: z.string().nonempty(),
      name: z.string().nonempty(),
      nested: z.strictObject({
        enabled: z.boolean(),
      }),
    });

    const file = generateSimpleFactoryDefinition(
      {
        id: 'test-id',
        name: 'Test Name',
        nested: {
          enabled: true,
        },
      },
      {
        schema,
        factory: {
          importName: 'credential',
          variableName: () => 'testEntity',
        },
      }
    );

    const text = file.getFullText();
    expect(text).toContain('export const testEntity = credential({');
    expect(text).toContain("id: 'test-id',");
    expect(text).toContain('nested: {');
    expect(text).toContain('enabled: true');
  });

  it('supports config transforms and finalize hooks', () => {
    const schema = z.strictObject({
      triggerId: z.string().nonempty(),
      name: z.string().nonempty(),
      executeCode: z.string().nonempty().optional(),
    });

    const file = generateSimpleFactoryDefinition(
      {
        triggerId: 'my-trigger',
        name: 'My Trigger',
        executeCode: '() => true',
      },
      {
        schema,
        factory: {
          importName: 'Trigger',
          variableName: () => 'myTrigger',
          syntaxKind: SyntaxKind.NewExpression,
        },
        buildConfig(parsed) {
          return {
            id: parsed.triggerId,
            name: parsed.name,
          };
        },
        finalize({ parsed, configObject }) {
          if (!parsed.executeCode) {
            return;
          }

          configObject.addPropertyAssignment({
            name: 'execute',
            initializer: parsed.executeCode,
          });
        },
      }
    );

    const text = file.getFullText();
    expect(text).toContain('export const myTrigger = new Trigger({');
    expect(text).toContain("id: 'my-trigger',");
    expect(text).toContain("name: 'My Trigger',");
    expect(text).toContain('execute: () => true');
    expect(text).not.toContain('executeCode');
  });

  it('throws a labeled validation error', () => {
    const schema = z.strictObject({
      id: z.string().nonempty(),
    });

    expect(() => {
      generateSimpleFactoryDefinition(
        {
          id: '',
        },
        {
          schema,
          factory: {
            importName: 'credential',
            variableName: () => 'testEntity',
          },
        }
      );
    }).toThrow('Validation failed for credential');
  });
});
