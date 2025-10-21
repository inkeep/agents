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
    lines.push(`${indent}props: ${formatZodSchema(schema, style, 1)}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Convert data component ID to camelCase variable name (like the examples)
 * Examples: 'weather-forecast' -> 'weatherForecast'
 */
function toDataComponentVariableName(id: string): string {
  // For data components, use camelCase conversion instead of underscores
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}