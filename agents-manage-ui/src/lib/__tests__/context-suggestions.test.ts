import { describe, it, expect } from 'vitest';
import { getContextSuggestions } from '../context-suggestions';

describe('context-suggestions', () => {
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

  it('should generate suggestions from requestContextSchema', () => {
    const suggestions = getContextSuggestions(mockContextSchema);
    
    expect(suggestions).toContain('requestContext.user_id');
    expect(suggestions).toContain('requestContext.auth_token');
    expect(suggestions).toContain('requestContext.org_name');
  });

  it('should generate suggestions from contextVariables', () => {
    const suggestions = getContextSuggestions(mockContextSchema);
    
    expect(suggestions).toContain('userName.name');
    expect(suggestions).toContain('userName.preferences');
    expect(suggestions).toContain('userName.preferences.theme');
    expect(suggestions).toContain('userName.preferences.language');
  });

  it('should return all expected suggestions', () => {
    const suggestions = getContextSuggestions(mockContextSchema);
    
    const expectedSuggestions = [
      'requestContext.user_id',
      'requestContext.auth_token',
      'requestContext.org_name',
      'userName.name',
      'userName.preferences',
      'userName.preferences.theme',
      'userName.preferences.language',
    ];
    
    for (const expected of expectedSuggestions) {
      expect(suggestions).toContain(expected);
    }
  });

  it('should handle empty schema', () => {
    const suggestions = getContextSuggestions({});
    expect(suggestions).toEqual([]);
  });

  it('should handle schema with only requestContextSchema', () => {
    const schema = {
      requestContextSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
        },
      },
    };
    
    const suggestions = getContextSuggestions(schema);
    expect(suggestions).toEqual(['requestContext.user_id']);
  });

  it('should handle schema with only contextVariables', () => {
    const schema = {
      contextVariables: {
        userName: {
          id: 'user-data',
          responseSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
    };
    
    const suggestions = getContextSuggestions(schema);
    expect(suggestions).toEqual(['userName.name']);
  });
});
