import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { getContextSuggestions } from '../context-suggestions';

describe('getContextSuggestions', () => {
  const mockContextSchema = {
    requestContextSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        auth_token: { type: 'string' },
        org_name: { type: 'string' },
      },
      required: ['user_id', 'auth_token'],
    },
    contextVariables: {
      userName: {
        id: 'user-data',
        name: 'User Data',
        responseSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            preferences: {
              type: 'object',
              properties: {
                theme: { type: 'string' },
                language: { type: 'string' },
              },
            },
          },
          required: ['name', 'preferences'],
        },
      },
    },
  };

  it('should return all expected suggestions', () => {
    const suggestions = getContextSuggestions(mockContextSchema);
    expect(suggestions).toStrictEqual([
      'requestContext.auth_token',
      'requestContext.org_name',
      'requestContext.user_id',
      'userName',
      'userName.name',
      'userName.preferences',
      'userName.preferences.language',
      'userName.preferences.theme',
    ]);
  });

  it('should handle empty schema', () => {
    const suggestions = getContextSuggestions({});
    expect(suggestions).toEqual([]);
  });

  // Based on packages/agents-core/src/__tests__/context/validation-edge-cases.test.ts
  describe('edge cases', () => {
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

      const suggestions = getContextSuggestions({
        contextVariables: {
          deep: {
            id: 'test',
            name: 'Test',
            responseSchema: z.toJSONSchema(deepSchema),
          },
        },
      });

      expect(suggestions).toStrictEqual([
        'deep',
        'deep.level1',
        'deep.level1.level2',
        'deep.level1.level2.level3',
        'deep.level1.level2.level3.level4',
        'deep.level1.level2.level3.level4.value',
      ]);
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

      const suggestions = getContextSuggestions({
        contextVariables: {
          data: {
            id: 'test',
            name: 'Test',
            responseSchema: z.toJSONSchema(mixedSchema),
          },
        },
      });
      expect(suggestions).toStrictEqual([
        'data',
        'data.users',
        'data.users[*]',
        'data.users[*].posts',
        'data.users[*].posts[*]',
        'data.users[*].posts[*].comments',
        'data.users[*].posts[*].comments[*]',
        'data.users[*].posts[*].comments[*].text',
      ]);
    });

    it('handles optional and nullable fields', () => {
      const optionalSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
        nullable: z.string().nullable(),
        nullish: z.string().nullish(),
      });

      const suggestions = getContextSuggestions({
        contextVariables: {
          opt: {
            id: 'test',
            name: 'Test',
            responseSchema: z.toJSONSchema(optionalSchema),
          },
        },
      });
      expect(suggestions).toStrictEqual([
        'opt',
        'opt.nullable',
        'opt.nullish',
        'opt.optional',
        'opt.required',
      ]);
    });

    it('handles union types', () => {
      const unionSchema = z.union([
        z.object({ type: z.literal('user'), name: z.string() }),
        z.object({ type: z.literal('admin'), role: z.string() }),
      ]);

      const suggestions = getContextSuggestions({
        contextVariables: {
          entity: {
            id: 'test',
            name: 'Test',
            responseSchema: z.toJSONSchema(unionSchema),
          },
        },
      });
      expect(suggestions).toStrictEqual(['entity', 'entity.name', 'entity.role', 'entity.type']);
    });

    it('handles multiple context variables', () => {
      const userSchema = z.object({ id: z.string(), name: z.string() });
      const settingsSchema = z.object({ theme: z.string(), locale: z.string() });
      const suggestions = getContextSuggestions({
        contextVariables: {
          user: {
            id: 'user',
            name: 'User',
            responseSchema: z.toJSONSchema(userSchema),
          },
          settings: {
            id: 'settings',
            name: 'Settings',
            responseSchema: z.toJSONSchema(settingsSchema),
          },
        },
        requestContextSchema: z.toJSONSchema(z.object({ apiKey: z.string() })),
      });
      expect(suggestions).toMatchInlineSnapshot(`
        [
          "requestContext.apiKey",
          "settings",
          "settings.locale",
          "settings.theme",
          "user",
          "user.id",
          "user.name",
        ]
      `);
    });
    //
    // it('handles empty path', () => {
    //   const schema = z.object({ value: z.string() });
    // });
  });
});
