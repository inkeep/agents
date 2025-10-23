/**
 * Deterministic status component generator - creates TypeScript status component files from status component data
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
 * Generate imports needed for a status component
 */
export function generateStatusComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import statusComponent
  imports.push(`import { statusComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have a detailsSchema
  if (componentData.detailsSchema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate export definition for a status component (without imports)
 */
export function generateStatusComponentExport(
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
  const globalEntry = componentNameMap?.get(`statusComponent:${componentId}`);
  if (!globalEntry) {
    throw new Error(`Status component ${componentId} not found in componentNameMap - this indicates a bug in the deterministic system`);
  }
  const componentVarName = globalEntry.name;
  
  // Export the status component
  lines.push(`export const ${componentVarName} = statusComponent({`);
  
  // Use type field as the identifier (like 'tool_summary')
  const typeField = componentData.type || componentId;
  lines.push(`${indent}type: ${q}${typeField}${q},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  // Add detailsSchema if available
  if (componentData.detailsSchema) {
    lines.push(`${indent}detailsSchema: ${formatZodSchema(componentData.detailsSchema, style, 1)}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate a status component file from status component data
 */
export function generateStatusComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import statements
  lines.push(`import { statusComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have a detailsSchema
  if (componentData.detailsSchema) {
    lines.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  lines.push('');
  
  // Generate variable name (convert to camelCase for status components)
  const componentVarName = toStatusComponentVariableName(componentId);
  
  // Export the status component
  lines.push(`export const ${componentVarName} = statusComponent({`);
  lines.push(`${indent}type: ${q}${componentData.type || componentId}${q},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  // Add detailsSchema if available
  if (componentData.detailsSchema) {
    lines.push(`${indent}detailsSchema: ${formatZodSchema(componentData.detailsSchema, style, 1)}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Convert status component ID to camelCase variable name (like the examples)
 * Examples: 'progress-update' -> 'progressUpdate'
 */
function toStatusComponentVariableName(id: string): string {
  // For status components, use camelCase conversion instead of underscores
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}