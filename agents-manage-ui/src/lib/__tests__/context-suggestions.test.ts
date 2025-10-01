import { describe, it, expect } from 'vitest';
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
      'requestContext.user_id',
      'requestContext.auth_token',
      'requestContext.org_name',
      'userName',
      'userName.name',
      'userName.preferences',
      'userName.preferences.theme',
      'userName.preferences.language',
    ]);
  });

  it('should handle empty schema', () => {
    const suggestions = getContextSuggestions({});
    expect(suggestions).toEqual([]);
  });
});
