/**
 * Deterministic data component generator - creates TypeScript data component files from FullProjectDefinition
 */

import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  toVariableName, 
  formatString, 
  formatZodSchema 
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate imports needed for a data component
 */
export function generateDataComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import dataComponent
  imports.push(`import { dataComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have schema/props
  if (componentData.props || componentData.schema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate export definition for a data component (without imports)
 */
export function generateDataComponentExport(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  componentNameMap?: Map<string, { name: string; type: string }>
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Use the globally registered name from componentNameMap (deterministic system)
  const globalEntry = componentNameMap?.get(`dataComponent:${componentId}`);
  if (!globalEntry) {
    throw new Error(`Data component ${componentId} not found in componentNameMap - this indicates a bug in the deterministic system`);
  }
  const componentVarName = globalEntry.name;
  
  // Export the data component
  lines.push(`export const ${componentVarName} = dataComponent({`);
  lines.push(`${indent}id: ${q}${componentId}${q},`);
  lines.push(`${indent}name: ${formatString(componentData.name || componentId, q)},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  // Add schema/props if available
  const schema = componentData.props || componentData.schema;
  if (schema) {
    let zodSchemaString: string;
    if (typeof schema === 'string') {
      // Schema is already a Zod string (converted by placeholder system)
      zodSchemaString = schema;
    } else {
      // Schema is a JSON schema object, convert it
      zodSchemaString = formatZodSchema(schema, style, 1);
    }
    lines.push(`${indent}props: ${zodSchemaString}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate a data component file from data component data
 */
export function generateDataComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import statements
  lines.push(`import { dataComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have schema/props
  if (componentData.props || componentData.schema) {
    lines.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  lines.push('');
  
  // Generate variable name (convert to camelCase for data components)
  const componentVarName = toDataComponentVariableName(componentId);
  
  // Export the data component
  lines.push(`export const ${componentVarName} = dataComponent({`);
  lines.push(`${indent}id: ${q}${componentId}${q},`);
  lines.push(`${indent}name: ${formatString(componentData.name || componentId, q)},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  // Add props schema if available
  const schema = componentData.props || componentData.schema;
  if (schema) {
    let zodSchemaString: string;
    if (typeof schema === 'string') {
      // Schema is already a Zod string (converted by placeholder system)
      zodSchemaString = schema;
    } else {
      // Schema is a JSON schema object, convert it
      zodSchemaString = formatZodSchema(schema, style, 1);
    }
    lines.push(`${indent}props: ${zodSchemaString}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Convert data component ID to camelCase variable name (like the examples)
 * Examples: 'weather-forecast' -> 'weatherForecast'
 */
function toDataComponentVariableName(id: string): string {
  if (!id || typeof id !== 'string') {
    console.error('🔍 toDataComponentVariableName called with invalid value:', {
      value: id,
      type: typeof id,
      stack: new Error().stack
    });
    throw new Error(`toDataComponentVariableName: expected string, got ${typeof id}: ${JSON.stringify(id)}`);
  }
  
  // For data components, use camelCase conversion instead of underscores
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}