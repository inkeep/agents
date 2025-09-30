/**
 * Simple utility to extract autocomplete suggestions from context schemas
 */

export interface ContextSchema {
  requestContextSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  contextVariables?: Record<string, {
    id: string;
    name?: string;
    responseSchema?: {
      type: string;
      properties?: Record<string, any>;
      required?: string[];
    };
  }>;
}

/**
 * Recursively extracts all possible paths from a JSON schema
 */
function extractPathsFromSchema(
  schema: any,
  prefix: string = '',
  maxDepth: number = 5,
  currentDepth: number = 0
): string[] {
  if (currentDepth >= maxDepth || !schema || typeof schema !== 'object') {
    return [];
  }

  const paths: string[] = [];
  
  if (schema.type === 'object' && schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const newPath = prefix ? `${prefix}.${key}` : key;
      paths.push(newPath);
      
      // Recursively get nested paths
      if (typeof value === 'object' && value !== null) {
        paths.push(...extractPathsFromSchema(value, newPath, maxDepth, currentDepth + 1));
      }
    }
  }
  
  return paths;
}

/**
 * Generates autocomplete suggestions from context schemas
 * Returns an array of strings that can be used for autocomplete
 */
export function getContextSuggestions(contextSchema: ContextSchema): string[] {
  const suggestions: string[] = [];
  
  // Add requestContext properties
  if (contextSchema.requestContextSchema?.properties) {
    const requestContextPaths = extractPathsFromSchema(contextSchema.requestContextSchema);
    for (const path of requestContextPaths) {
      suggestions.push(`requestContext.${path}`);
    }
  }
  
  // Add context variable properties
  if (contextSchema.contextVariables) {
    for (const [variableName, variable] of Object.entries(contextSchema.contextVariables)) {
      if (variable.responseSchema?.properties) {
        const responsePaths = extractPathsFromSchema(variable.responseSchema);
        for (const path of responsePaths) {
          suggestions.push(`${variableName}.${path}`);
        }
      }
    }
  }
  
  return suggestions;
}

/**
 * Example usage:
 * 
 * const contextSchema = {
 *   requestContextSchema: {
 *     type: 'object',
 *     properties: {
 *       user_id: { type: 'string' },
 *       auth_token: { type: 'string' },
 *       org_name: { type: 'string' },
 *       profile: {
 *         type: 'object',
 *         properties: {
 *           name: { type: 'string' },
 *           email: { type: 'string' }
 *         }
 *       }
 *     }
 *   },
 *   contextVariables: {
 *     userName: {
 *       id: 'user-data',
 *       responseSchema: {
 *         type: 'object',
 *         properties: {
 *           name: { type: 'string' },
 *           preferences: {
 *             type: 'object',
 *             properties: {
 *               theme: { type: 'string' },
 *               language: { type: 'string' }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * };
 * 
 * const suggestions = getContextSuggestions(contextSchema);
 * // Returns: [
 * //   'requestContext.user_id',
 * //   'requestContext.auth_token', 
 * //   'requestContext.org_name',
 * //   'requestContext.profile',
 * //   'requestContext.profile.name',
 * //   'requestContext.profile.email',
 * //   'userName.name',
 * //   'userName.preferences',
 * //   'userName.preferences.theme',
 * //   'userName.preferences.language'
 * // ]
 */
