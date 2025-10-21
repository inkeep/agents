/**
 * Shared utilities for deterministic code generators
 */
import { jsonSchemaToZod } from 'json-schema-to-zod';

/**
 * Configuration for code generation style
 */
export interface CodeStyle {
  quotes: 'single' | 'double';
  indentation: string; // e.g., '  ' for 2 spaces, '\t' for tabs
  semicolons: boolean;
}

/**
 * Default code style matching the examples
 */
export const DEFAULT_CODE_STYLE: CodeStyle = {
  quotes: 'single',
  indentation: '  ',
  semicolons: true
};

/**
 * Convert an ID to a valid camelCase TypeScript variable name
 * Handles edge cases like 'fUI2riwrBVJ6MepT8rjx0' and converts 'inkeep-rag-mcp' to 'inkeepRagMcp'
 */
export function toVariableName(id: string): string {
  // If it's already a valid variable name, use it as-is
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id)) {
    return id;
  }
  
  // For normal IDs like 'inkeep-rag-mcp', convert to camelCase
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Component type for generating unique names with descriptive suffixes
 */
export type ComponentType = 
  | 'agent' 
  | 'subAgent' 
  | 'project' 
  | 'tool' 
  | 'dataComponent' 
  | 'artifactComponent'
  | 'statusComponent';

/**
 * Ensure a variable name is unique by using descriptive suffixes based on component type
 */
export function ensureUniqueName(
  baseName: string, 
  componentType: ComponentType,
  usedNames: Set<string>
): string {
  if (!usedNames.has(baseName)) {
    return baseName;
  }
  
  // Try with component type suffix
  const withSuffix = baseName + componentType.charAt(0).toUpperCase() + componentType.slice(1);
  if (!usedNames.has(withSuffix)) {
    return withSuffix;
  }
  
  // If still conflicts, add numbers
  let counter = 2;
  let uniqueName = `${withSuffix}${counter}`;
  
  while (usedNames.has(uniqueName)) {
    counter++;
    uniqueName = `${withSuffix}${counter}`;
  }
  
  return uniqueName;
}

/**
 * Format a string value, handling multiline strings and escaping
 */
export function formatString(value: string, quote: string): string {
  if (!value) return `${quote}${quote}`;
  
  // Use template literal for multiline strings or very long strings
  if (value.includes('\n') || value.length > 100) {
    return `\`${value.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\``;
  }
  
  // Use regular quotes for short strings
  const escaped = value.replace(new RegExp(quote, 'g'), '\\' + quote);
  return `${quote}${escaped}${quote}`;
}

/**
 * Format a Zod schema object as TypeScript code using json-schema-to-zod converter
 */
export function formatZodSchema(schema: any, style: CodeStyle, indentLevel: number): string {
  if (!schema || typeof schema !== 'object') {
    return 'z.unknown()';
  }

  try {
    // Use the json-schema-to-zod converter for proper schema conversion
    const zodString = jsonSchemaToZod(schema);
    return zodString;
  } catch (error) {
    console.warn('Failed to convert JSON schema to Zod, falling back to manual conversion:', error);
    // Fallback to the original manual conversion
    return formatZodSchemaManual(schema, style, indentLevel);
  }
}

/**
 * Manual fallback for Zod schema conversion (original implementation)
 */
function formatZodSchemaManual(schema: any, style: CodeStyle, indentLevel: number): string {
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  
  if (!schema || typeof schema !== 'object') {
    return 'z.unknown()';
  }
  
  // Handle object schema
  if (schema.type === 'object' && schema.properties) {
    const lines: string[] = ['z.object({'];
    
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      const zodType = getZodTypeForProperty(prop, style, indentLevel + 1);
      lines.push(`${indent}${key}: ${zodType},`);
    }
    
    lines.push(`${baseIndent}})`);
    
    // Add description if available
    if (schema.description) {
      return lines.join('\n') + `.describe(\`${schema.description}\`)`;
    }
    
    return lines.join('\n');
  }
  
  // Handle array schema at top level
  if (schema.type === 'array') {
    const itemType = schema.items ? getZodTypeForProperty(schema.items, style, indentLevel) : 'z.unknown()';
    let result = `z.array(${itemType})`;
    
    if (schema.description) {
      result += `.describe(\`${schema.description}\`)`;
    }
    
    return result;
  }
  
  return getZodTypeForProperty(schema, style, indentLevel);
}

/**
 * Get Zod type string for a single property
 */
export function getZodTypeForProperty(prop: any, style: CodeStyle, indentLevel: number): string {
  if (!prop || typeof prop !== 'object') {
    return 'z.unknown()';
  }
  
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  
  let zodType = 'z.unknown()';
  
  // Handle anyOf patterns (common in JSON Schema)
  if (prop.anyOf && Array.isArray(prop.anyOf)) {
    const types = prop.anyOf.map((option: any) => {
      switch (option.type) {
        case 'string': return 'z.string()';
        case 'number': case 'integer': return 'z.number()';
        case 'boolean': return 'z.boolean()';
        case 'null': return 'z.null()';
        case 'array': 
          if (option.items) {
            const itemType = getZodTypeForProperty(option.items, style, indentLevel);
            return `z.array(${itemType})`;
          }
          return 'z.array(z.unknown())';
        default: return 'z.unknown()';
      }
    });
    
    // If it's just string | null, use .nullable()
    if (types.length === 2 && types.includes('z.string()') && types.includes('z.null()')) {
      zodType = 'z.string().nullable()';
    } else if (types.length === 2 && types.includes('z.number()') && types.includes('z.null()')) {
      zodType = 'z.number().nullable()';
    } else if (types.length === 2 && types.includes('z.boolean()') && types.includes('z.null()')) {
      zodType = 'z.boolean().nullable()';
    } else {
      // Use union for more complex anyOf patterns
      zodType = `z.union([${types.join(', ')}])`;
    }
  } else {
    // Handle regular type patterns
    switch (prop.type) {
      case 'string':
        zodType = 'z.string()';
        break;
      case 'number':
      case 'integer':
        zodType = 'z.number()';
        break;
      case 'boolean':
        zodType = 'z.boolean()';
        break;
    case 'array':
      if (prop.items) {
        const itemType = getZodTypeForProperty(prop.items, style, indentLevel);
        zodType = `z.array(${itemType})`;
      } else {
        zodType = 'z.array(z.unknown())';
      }
      break;
    case 'object':
      if (prop.properties) {
        // Handle nested object
        const lines: string[] = ['z.object({'];
        
        for (const [key, nestedProp] of Object.entries(prop.properties) as [string, any][]) {
          const nestedType = getZodTypeForProperty(nestedProp, style, indentLevel + 1);
          lines.push(`${indent}${key}: ${nestedType},`);
        }
        
        lines.push(`${baseIndent}})`);
        zodType = lines.join('\n');
      } else {
        zodType = 'z.record(z.unknown())';
      }
      break;
    }
  }
  
  // Add description if available
  if (prop.description) {
    zodType += `.describe(\`${prop.description}\`)`;
  }
  
  // Add nullable modifier
  if (prop.nullable) {
    zodType += '.nullable()';
  }
  
  // Add optional modifier
  if (prop.optional) {
    zodType += '.optional()';
  }
  
  return zodType;
}

/**
 * Generate import statements as an array of strings
 */
export function generateImports(imports: Array<{ from: string; imports: string[] }>, style: CodeStyle): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  
  return imports.map(({ from, imports: importList }) => {
    if (importList.length === 1) {
      return `import { ${importList[0]} } from ${q}${from}${q}${semi}`;
    } else {
      return `import { ${importList.join(', ')} } from ${q}${from}${q}${semi}`;
    }
  });
}

/**
 * Format a string with template variables, converting {{context.variable}} to context.toTemplate('variable')
 * Only converts {{headers.variable}} patterns, preserves other template variables for runtime
 */
export function formatStringWithTemplates(value: string, quote: string, headersVarName: string = 'requestContext'): string {
  if (!value) return `${quote}${quote}`;
  
  // Only convert {{headers.variable}} patterns to .toTemplate() calls
  // Other template variables like {{projectDescription.variable}} should be preserved for runtime
  const headersPattern = /\{\{headers\.(\w+)\}\}/g;
  const headerMatches = [...value.matchAll(headersPattern)];
  
  if (headerMatches.length === 0) {
    // No headers template variables, use regular string formatting
    return formatString(value, quote);
  }
  
  // If the entire string is a single headers template variable, return the .toTemplate() call directly
  if (headerMatches.length === 1 && headerMatches[0][0] === value) {
    const [, variableName] = headerMatches[0];
    return `${headersVarName}.toTemplate(${quote}${variableName}${quote})`;
  }
  
  // Handle mixed strings with headers template variables using template literals
  let result = value;
  for (const match of headerMatches) {
    const [fullMatch, variableName] = match;
    result = result.replace(fullMatch, `\${${headersVarName}.toTemplate(${quote}${variableName}${quote})}`);
  }
  
  return `\`${result.replace(/`/g, '\\`')}\``;
}

/**
 * Format a JavaScript object as TypeScript code
 */
export function formatObject(obj: any, style: CodeStyle, indentLevel: number): string {
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  const q = style.quotes === 'single' ? "'" : '"';
  
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    const lines: string[] = ['['];
    for (const item of obj) {
      if (typeof item === 'object') {
        lines.push(`${indent}${formatObject(item, style, indentLevel + 1)},`);
      } else {
        lines.push(`${indent}${JSON.stringify(item)},`);
      }
    }
    lines.push(`${baseIndent}]`);
    return lines.join('\n');
  }
  
  const lines: string[] = ['{'];
  for (const [key, value] of Object.entries(obj)) {
    // Quote keys that contain special characters or are not valid identifiers
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `${q}${key}${q}`;
    
    if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${formattedKey}: ${formatObject(value, style, indentLevel + 1)},`);
    } else if (typeof value === 'string') {
      // Check if this is a template variable that should use .toTemplate()
      // For now, use default headers variable name - this could be made more context-aware
      const templateString = formatStringWithTemplates(value, q);
      lines.push(`${indent}${formattedKey}: ${templateString},`);
    } else {
      lines.push(`${indent}${formattedKey}: ${JSON.stringify(value)},`);
    }
  }
  lines.push(`${baseIndent}}`);
  
  return lines.join('\n');
}