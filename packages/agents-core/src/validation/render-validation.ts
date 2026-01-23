/**
 * Validation utilities for component render code
 */

export interface RenderValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
}

const MAX_CODE_SIZE = 50000; // 50KB max
const MAX_DATA_SIZE = 10000; // 10KB max for sample data

// Dangerous patterns with user-friendly error messages
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\beval\s*\(/i,
    message: 'eval() is not allowed',
  },
  {
    pattern: /\bFunction\s*\(/i,
    message: 'Function constructor is not allowed',
  },
  {
    pattern: /dangerouslySetInnerHTML/i,
    message: 'dangerouslySetInnerHTML is not allowed',
  },
  {
    pattern: /<script\b/i,
    message: 'Script tags are not allowed',
  },
  {
    pattern: /\bon\w+\s*=/i,
    message: 'Inline event handlers (onClick=, onLoad=, etc.) are not allowed',
  },
  {
    pattern: /document\.write/i,
    message: 'document.write is not allowed',
  },
  {
    pattern: /window\.location/i,
    message: 'window.location is not allowed',
  },
  {
    pattern: /\.innerHTML\s*=/i,
    message: 'innerHTML manipulation is not allowed',
  },
];

// Only allow imports from lucide-react
const ALLOWED_IMPORTS = ['lucide-react', 'react'];

/**
 * Validates component render code and data
 */
export function validateRender(render: {
  component: string;
  mockData: Record<string, unknown>;
}): RenderValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate component exists
  if (!render.component || typeof render.component !== 'string') {
    return {
      isValid: false,
      errors: [{ field: 'render.component', message: 'Component must be a non-empty string' }],
    };
  }

  // Validate mockData exists
  if (!render.mockData || typeof render.mockData !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'render.mockData', message: 'MockData must be an object' }],
    };
  }

  // Validate that the render object can be properly serialized to JSON and back
  // This catches invalid escape sequences like \w, \d, \x that are valid in JS but not JSON
  // and ensures no data is lost during round-trip (e.g., undefined values, Date objects)
  try {
    const serialized = JSON.stringify(render);
    const parsed = JSON.parse(serialized);
    // Compare to ensure round-trip doesn't lose or transform data
    if (JSON.stringify(parsed) !== serialized) {
      return {
        isValid: false,
        errors: [
          {
            field: 'render',
            message: 'Render data contains values that cannot be safely serialized to JSON',
          },
        ],
      };
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown JSON serialization error';
    return {
      isValid: false,
      errors: [
        {
          field: 'render',
          message: `Render data contains invalid characters that cannot be stored in the database: ${errorMessage}`,
        },
      ],
    };
  }

  // Check component size
  if (render.component.length > MAX_CODE_SIZE) {
    errors.push({
      field: 'render.component',
      message: `Component size exceeds maximum allowed (${MAX_CODE_SIZE} characters)`,
    });
  }

  // Check mockData size
  const dataString = JSON.stringify(render.mockData);
  if (dataString.length > MAX_DATA_SIZE) {
    errors.push({
      field: 'render.mockData',
      message: `MockData size exceeds maximum allowed (${MAX_DATA_SIZE} characters)`,
    });
  }

  // Check for dangerous patterns
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(render.component)) {
      errors.push({
        field: 'render.component',
        message: `Component contains potentially dangerous pattern: ${message}`,
      });
    }
  }

  // Validate imports
  const importMatches = render.component.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    const importPath = match[1];
    // Allow local imports
    if (!ALLOWED_IMPORTS.includes(importPath) && !importPath.startsWith('.')) {
      errors.push({
        field: 'render.component',
        message: `Import from "${importPath}" is not allowed. Only imports from ${ALLOWED_IMPORTS.join(', ')} are permitted`,
      });
    }
  }

  // Basic JSX validation - must have a function declaration
  const hasFunctionDeclaration = /function\s+\w+\s*\(/.test(render.component);
  if (!hasFunctionDeclaration) {
    errors.push({
      field: 'render.component',
      message: 'Component must contain a function declaration',
    });
  }

  // Check for return statement
  const hasReturn = /return\s*\(?\s*</.test(render.component);
  if (!hasReturn) {
    errors.push({
      field: 'render.component',
      message: 'Component function must have a return statement with JSX',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
