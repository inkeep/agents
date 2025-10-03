import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { contextConfig, fetchDefinition } from '../../context/ContextConfig';

describe('toTemplate edge cases', () => {
  it('handles deeply nested structures', () => {
    const deepSchema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            level4: z.object({
              value: z.string(),
            }),
          }),
        }),
      }),
    });

    const fetcher = fetchDefinition({
      id: 'deep',
      name: 'Deep',
      trigger: 'initialization',
      fetchConfig: { url: '/api/deep' },
      responseSchema: deepSchema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      contextVariables: { deep: fetcher },
    });

    expect(config.toTemplate('deep.level1.level2.level3.level4.value')).toBe(
      '{{deep.level1.level2.level3.level4.value}}'
    );
  });

  it('handles mixed arrays and objects', () => {
    const mixedSchema = z.object({
      users: z.array(
        z.object({
          posts: z.array(
            z.object({
              comments: z.array(
                z.object({
                  text: z.string(),
                })
              ),
            })
          ),
        })
      ),
    });

    const fetcher = fetchDefinition({
      id: 'mixed',
      name: 'Mixed',
      trigger: 'invocation',
      fetchConfig: { url: '/api/mixed' },
      responseSchema: mixedSchema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      contextVariables: { data: fetcher },
    });

    expect(config.toTemplate('data.users[0].posts[*].comments[0].text')).toBe(
      '{{data.users[0].posts[*].comments[0].text}}'
    );
  });

  it('handles optional and nullable fields', () => {
    const optionalSchema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      nullable: z.string().nullable(),
      nullish: z.string().nullish(),
    });

    const fetcher = fetchDefinition({
      id: 'optional',
      name: 'Optional',
      trigger: 'initialization',
      fetchConfig: { url: '/api/optional' },
      responseSchema: optionalSchema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      contextVariables: { opt: fetcher },
    });

    // All fields should be accessible regardless of optionality
    expect(config.toTemplate('opt.required')).toBe('{{opt.required}}');
    expect(config.toTemplate('opt.optional')).toBe('{{opt.optional}}');
    expect(config.toTemplate('opt.nullable')).toBe('{{opt.nullable}}');
    expect(config.toTemplate('opt.nullish')).toBe('{{opt.nullish}}');
  });

  it('handles union types', () => {
    const unionSchema = z.union([
      z.object({ type: z.literal('user'), name: z.string() }),
      z.object({ type: z.literal('admin'), role: z.string() }),
    ]);

    const fetcher = fetchDefinition({
      id: 'union',
      name: 'Union',
      trigger: 'initialization',
      fetchConfig: { url: '/api/union' },
      responseSchema: unionSchema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      contextVariables: { entity: fetcher },
    });

    // Union fields should all be accessible
    expect(config.toTemplate('entity')).toBe('{{entity}}');
    expect(config.toTemplate('entity.type')).toBe('{{entity.type}}');
    expect(config.toTemplate('entity.name')).toBe('{{entity.name}}');
    expect(config.toTemplate('entity.role')).toBe('{{entity.role}}');
  });

  it('handles multiple context variables', () => {
    const userSchema = z.object({ id: z.string(), name: z.string() });
    const settingsSchema = z.object({ theme: z.string(), locale: z.string() });

    const userFetcher = fetchDefinition({
      id: 'user',
      name: 'User',
      trigger: 'initialization',
      fetchConfig: { url: '/api/user' },
      responseSchema: userSchema,
    });

    const settingsFetcher = fetchDefinition({
      id: 'settings',
      name: 'Settings',
      trigger: 'initialization',
      fetchConfig: { url: '/api/settings' },
      responseSchema: settingsSchema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      requestContextSchema: z.object({ apiKey: z.string() }),
      contextVariables: {
        user: userFetcher,
        settings: settingsFetcher,
      },
    });

    // All context variables should be accessible
    expect(config.toTemplate('requestContext.apiKey')).toBe('{{requestContext.apiKey}}');
    expect(config.toTemplate('user.name')).toBe('{{user.name}}');
    expect(config.toTemplate('settings.theme')).toBe('{{settings.theme}}');
  });

  it('handles empty path', () => {
    const schema = z.object({ value: z.string() });

    const fetcher = fetchDefinition({
      id: 'test',
      name: 'Test',
      trigger: 'initialization',
      fetchConfig: { url: '/api/test' },
      responseSchema: schema,
    });

    const config = contextConfig({
      id: 'test',
      name: 'Test',
      graphId: 'test-graph',
      contextVariables: { data: fetcher },
    });

    expect(config.toTemplate('')).toBe('{{}}');
  });
});
