/**
 * Status Component Generator - Generate status component definitions
 * 
 * Generates status components using the statusComponent() builder function from @inkeep/agents-sdk
 * Status components are used for progress updates and event notifications in agents
 */

import { jsonSchemaToZod } from 'json-schema-to-zod';

interface CodeStyle {
  quotes: 'single' | 'double';
  semicolons: boolean;
  indentation: string;
}

const DEFAULT_STYLE: CodeStyle = {
  quotes: 'single',
  semicolons: true,
  indentation: '  ',
};

/**
 * Utility functions
 */
function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

function formatString(str: string, quote: string = "'", multiline: boolean = false): string {
  if (!str) return `${quote}${quote}`;
  
  if (multiline && (str.includes('\n') || str.length > 80)) {
    // Use template literal for multiline strings
    return `\`${str.replace(/`/g, '\\`')}\``;
  }
  
  return `${quote}${str.replace(new RegExp(quote, 'g'), '\\' + quote)}${quote}`;
}

/**
 * Convert JSON Schema to Zod schema using existing utility
 */
function convertJsonSchemaToZod(schema: any): string {
  if (!schema || typeof schema !== 'object') {
    return 'z.any()';
  }
  
  try {
    return jsonSchemaToZod(schema);
  } catch (error) {
    console.warn('Failed to convert JSON schema to Zod:', error);
    return 'z.any()';
  }
}

/**
 * Generate Status Component Definition using statusComponent() builder function
 */
export function generateStatusComponentDefinition(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  // Validate required parameters
  if (!componentId || typeof componentId !== 'string') {
    throw new Error('componentId is required and must be a string');
  }
  
  if (!componentData || typeof componentData !== 'object') {
    throw new Error(`componentData is required for status component '${componentId}'`);
  }
  
  // Validate required status component fields
  const requiredFields = ['type'];
  const missingFields = requiredFields.filter(field => 
    !componentData[field] || componentData[field] === null || componentData[field] === undefined
  );
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields for status component '${componentId}': ${missingFields.join(', ')}`);
  }
  
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const componentVarName = toCamelCase(componentId);
  const lines: string[] = [];
  
  lines.push(`export const ${componentVarName} = statusComponent({`);
  
  // Required fields - these must be present
  lines.push(`${indentation}type: ${formatString(componentData.type, q)},`);
  
  if (componentData.description) {
    lines.push(`${indentation}description: ${formatString(componentData.description, q, true)},`);
  }
  
  // Details schema (convert from JSON schema to zod)
  // Status components use either `detailsSchema` or `schema` field from componentData
  const schema = componentData.detailsSchema || componentData.schema;
  if (schema) {
    const zodSchema = convertJsonSchemaToZod(schema);
    // Handle multiline schemas with proper indentation
    if (zodSchema.includes('\n')) {
      const schemaLines = zodSchema.split('\n');
      lines.push(`${indentation}detailsSchema: ${schemaLines[0]}`);
      schemaLines.slice(1, -1).forEach(line => {
        lines[lines.length - 1] += '\n' + indentation + line;
      });
      lines[lines.length - 1] += '\n' + indentation + schemaLines[schemaLines.length - 1] + ',';
    } else {
      lines.push(`${indentation}detailsSchema: ${zodSchema},`);
    }
  }
  
  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for a status component file
 */
export function generateStatusComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import statusComponent from SDK
  imports.push(`import { statusComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have schema/detailsSchema
  const schema = componentData.detailsSchema || componentData.schema;
  if (schema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate complete status component file (imports + definition)
 */
export function generateStatusComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateStatusComponentImports(componentId, componentData, style);
  const definition = generateStatusComponentDefinition(componentId, componentData, style);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}