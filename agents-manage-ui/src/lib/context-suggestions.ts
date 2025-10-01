/**
 * Simple utility to extract autocomplete suggestions from context schemas
 */

export interface ContextSchema {
  requestContextSchema?: Record<string, any>;
  contextVariables?: Record<
    string,
    {
      id: string;
      name?: string;
      responseSchema?: Record<string, any>;
    }
  >;
}

/**
 * Recursively extracts all possible paths from a JSON schema
 */
function extractPathsFromSchema(
  schema: any,
  prefix = '',
  maxDepth = 10,
  currentDepth = 0
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

  // Handle array items
  if (schema.type === 'array' && schema.items) {
    const arrayPath = prefix ? `${prefix}[*]` : '[*]';
    paths.push(arrayPath);

    // Recursively get paths from array items
    if (schema.items && typeof schema.items === 'object') {
      paths.push(...extractPathsFromSchema(schema.items, arrayPath, maxDepth, currentDepth + 1));
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

  // Add requestContext properties (but not the top-level object)
  if (contextSchema.requestContextSchema?.properties) {
    const requestContextPaths = extractPathsFromSchema(contextSchema.requestContextSchema);
    for (const path of requestContextPaths) {
      suggestions.push(`requestContext.${path}`);
    }
  }

  // Add context variable names and their properties
  if (contextSchema.contextVariables) {
    for (const [variableName, variable] of Object.entries(contextSchema.contextVariables)) {
      // Add the top-level variable name
      suggestions.push(variableName);

      // Add nested properties if responseSchema exists
      if (variable.responseSchema) {
        const responsePaths = extractPathsFromSchema(variable.responseSchema);
        for (const path of responsePaths) {
          suggestions.push(`${variableName}.${path}`);
        }
      }
    }
  }

  return suggestions;
}
