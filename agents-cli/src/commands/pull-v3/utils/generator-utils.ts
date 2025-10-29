/**
 * Shared utilities for component generators
 */

export interface CodeStyle {
  quotes: 'single' | 'double';
  semicolons: boolean;
  indentation: string;
}

export const DEFAULT_STYLE: CodeStyle = {
  quotes: 'single',
  semicolons: true,
  indentation: '  ',
};

/**
 * Convert kebab-case or snake_case to camelCase for variable names
 */
export function toCamelCase(str: string): string {
  const result = str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
    
  // Ensure first character is lowercase for camelCase (not PascalCase)
  return result.charAt(0).toLowerCase() + result.slice(1);
}

/**
 * Format a string value with proper quoting and multiline handling
 */
export function formatString(str: string, quote: string = "'", multiline: boolean = false): string {
  if (!str && str !== '') return `${quote}${quote}`;
  
  if (multiline && (str.includes('\n') || str.length > 80)) {
    // Use template literal for multiline strings
    return `\`${str.replace(/`/g, '\\`')}\``;
  }
  
  return `${quote}${str.replace(new RegExp(quote, 'g'), '\\' + quote)}${quote}`;
}

/**
 * Check if a string contains template variables like {{user.name}}
 */
export function hasTemplateVariables(str: string): boolean {
  return /\{\{[^}]+\}\}/.test(str);
}

/**
 * Determine if a variable path exists in headers schema
 */
function isHeadersVariable(variablePath: string, contextConfigData: any): boolean {
  if (!contextConfigData?.headersSchema?.schema) return false;
  
  // For Zod schemas, check if the path exists in the schema structure
  // This is a simplified check - in practice you might need more sophisticated schema analysis
  const schemaStr = JSON.stringify(contextConfigData.headersSchema.schema);
  return schemaStr.includes(`"${variablePath}"`) || schemaStr.includes(variablePath.split('.')[0]);
}

/**
 * Determine if a variable path exists in context variables
 */
function isContextVariable(variablePath: string, contextConfigData: any): boolean {
  if (!contextConfigData?.contextVariables) return false;
  
  const topLevelVar = variablePath.split('.')[0];
  return Object.keys(contextConfigData.contextVariables).includes(topLevelVar);
}

/**
 * Format prompt strings with appropriate context.toTemplate() or headers.toTemplate() based on actual schema structure
 */
export function formatPromptWithContext(str: string, contextVarName: string, headersVarName: string, contextConfigData: any, quote: string = "'", multiline: boolean = false): string {
  if (!str && str !== '') return `${quote}${quote}`;
  
  // Check if the string contains template variables like {{user.name}}
  if (hasTemplateVariables(str)) {
    // Convert template variables to appropriate .toTemplate() calls based on actual schema
    const convertedStr = str.replace(/\{\{([^}]+)\}\}/g, (match, variablePath) => {
      if (isContextVariable(variablePath, contextConfigData)) {
        return `\${${contextVarName}.toTemplate("${variablePath}")}`;
      } else if (isHeadersVariable(variablePath, contextConfigData)) {
        return `\${${headersVarName}.toTemplate("${variablePath}")}`;
      } else {
        // Default to context if we can't determine (safer fallback)
        return `\${${contextVarName}.toTemplate("${variablePath}")}`;
      }
    });
    return `\`${convertedStr.replace(/`/g, '\\`')}\``;
  }
  
  // Use regular string formatting
  return formatString(str, quote, multiline);
}

/**
 * Format prompt strings with headers.toTemplate() only (for backwards compatibility)
 */
export function formatPromptWithHeaders(str: string, headersVarName: string, quote: string = "'", multiline: boolean = false): string {
  if (!str && str !== '') return `${quote}${quote}`;
  
  // Check if the string contains template variables like {{user.name}}
  if (hasTemplateVariables(str)) {
    // Convert {{variable}} to ${headers.toTemplate("variable")} syntax
    const convertedStr = str.replace(/\{\{([^}]+)\}\}/g, `\${${headersVarName}.toTemplate("$1")}`);
    return `\`${convertedStr.replace(/`/g, '\\`')}\``;
  }
  
  // Use regular string formatting
  return formatString(str, quote, multiline);
}


/**
 * Format array of references (tools, agents, components) with proper indentation
 */
export function formatReferencesArray(references: string[] | Record<string, any>, style: CodeStyle, indentLevel: number): string {
  // Handle case where references is an object (convert keys to array)
  let refArray: string[];
  if (Array.isArray(references)) {
    // Extract IDs from objects or use strings as-is
    refArray = references.map(item => {
      if (typeof item === 'string') {
        return toCamelCase(item);
      } else if (typeof item === 'object' && item && item.id) {
        return toCamelCase(item.id);
      } else {
        return toCamelCase(String(item));
      }
    });
  } else if (references && typeof references === 'object') {
    refArray = Object.keys(references).map(key => toCamelCase(key));
  } else {
    return '[]';
  }
  
  if (!refArray || refArray.length === 0) {
    return '[]';
  }
  
  const { indentation } = style;
  const indent = indentation.repeat(indentLevel);
  
  if (refArray.length === 1) {
    // Single line format for one reference
    return `[${refArray[0]}]`;
  }
  
  // Multi-line format for multiple references
  const lines: string[] = ['['];
  for (const ref of refArray) {
    lines.push(`${indent}${ref},`);
  }
  // Remove trailing comma from last reference
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push(`${indentation.repeat(indentLevel - 1)}]`);
  
  return lines.join('\n');
}

/**
 * Format object properties as JavaScript object literal
 */
export function formatObject(obj: any, style: CodeStyle, indentLevel: number): string {
  if (!obj || typeof obj !== 'object') {
    return '{}';
  }
  
  const { quotes, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const indent = indentation.repeat(indentLevel);
  const lines: string[] = ['{'];
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip null and undefined values
    if (value === null || value === undefined) {
      continue;
    }
    
    // Format the key - quote it if it contains special characters or starts with number
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : formatString(key, q);
    
    if (typeof value === 'string') {
      lines.push(`${indent}${formattedKey}: ${formatString(value, q)},`);
    } else if (typeof value === 'object') {
      lines.push(`${indent}${formattedKey}: ${formatObject(value, style, indentLevel + 1)},`);
    } else {
      lines.push(`${indent}${formattedKey}: ${JSON.stringify(value)},`);
    }
  }
  
  // Remove trailing comma from last property
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`${indentation.repeat(indentLevel - 1)}}`);
  return lines.join('\n');
}

/**
 * Remove trailing comma from the last line in an array of lines
 */
export function removeTrailingComma(lines: string[]): void {
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
}

/**
 * Generate standard import statement with proper quoting and semicolons
 */
export function generateImport(imports: string[], from: string, style: CodeStyle): string {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  if (imports.length === 1) {
    return `import { ${imports[0]} } from ${q}${from}${q}${semi}`;
  } else {
    return `import { ${imports.join(', ')} } from ${q}${from}${q}${semi}`;
  }
}

/**
 * Check if a value is truthy and should be included in output
 */
export function shouldInclude(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && Object.keys(value).length === 0) return false;
  return true;
}

/**
 * Generate complete file content with imports and definitions
 */
export function generateFileContent(imports: string[], definitions: string[]): string {
  const content: string[] = [];
  
  if (imports.length > 0) {
    content.push(imports.join('\n'));
  }
  
  if (definitions.length > 0) {
    if (content.length > 0) {
      content.push(''); // Empty line between imports and definitions
    }
    content.push(definitions.join('\n\n'));
  }
  
  content.push(''); // Trailing newline
  
  return content.join('\n');
}