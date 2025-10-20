/**
 * Validation utilities for component preview code
 */

export interface PreviewValidationResult {
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
const ALLOWED_IMPORTS = ['lucide-react'];

/**
 * Validates component preview code and data
 */
export function validatePreview(preview: {
  code: string;
  data: Record<string, unknown>;
}): PreviewValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate code exists
  if (!preview.code || typeof preview.code !== 'string') {
    return {
      isValid: false,
      errors: [{ field: 'preview.code', message: 'Code must be a non-empty string' }],
    };
  }

  // Validate data exists
  if (!preview.data || typeof preview.data !== 'object') {
    return {
      isValid: false,
      errors: [{ field: 'preview.data', message: 'Data must be an object' }],
    };
  }

  // Check code size
  if (preview.code.length > MAX_CODE_SIZE) {
    errors.push({
      field: 'preview.code',
      message: `Code size exceeds maximum allowed (${MAX_CODE_SIZE} characters)`,
    });
  }

  // Check data size
  const dataString = JSON.stringify(preview.data);
  if (dataString.length > MAX_DATA_SIZE) {
    errors.push({
      field: 'preview.data',
      message: `Data size exceeds maximum allowed (${MAX_DATA_SIZE} characters)`,
    });
  }

  // Check for dangerous patterns
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(preview.code)) {
      errors.push({
        field: 'preview.code',
        message: `Code contains potentially dangerous pattern: ${message}`,
      });
    }
  }

  // Validate imports
  const importMatches = preview.code.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    const importPath = match[1];
    if (!ALLOWED_IMPORTS.includes(importPath)) {
      errors.push({
        field: 'preview.code',
        message: `Import from "${importPath}" is not allowed. Only imports from ${ALLOWED_IMPORTS.join(', ')} are permitted`,
      });
    }
  }

  // Basic JSX validation - must have a function declaration
  const hasFunctionDeclaration = /function\s+\w+\s*\(/.test(preview.code);
  if (!hasFunctionDeclaration) {
    errors.push({
      field: 'preview.code',
      message: 'Code must contain a function declaration',
    });
  }

  // Check for return statement
  const hasReturn = /return\s*\(?\s*</.test(preview.code);
  if (!hasReturn) {
    errors.push({
      field: 'preview.code',
      message: 'Component function must have a return statement with JSX',
    });
  }

  // Check for export statements (should not have any)
  if (/\bexport\s+(default\s+)?/i.test(preview.code)) {
    errors.push({
      field: 'preview.code',
      message: 'Code should not contain export statements',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
