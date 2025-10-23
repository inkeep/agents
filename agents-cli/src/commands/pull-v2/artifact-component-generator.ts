/**
 * Deterministic artifact component generator - creates TypeScript artifact component files from FullProjectDefinition
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
 * Generate imports needed for an artifact component
 */
export function generateArtifactComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Check if we need preview import
  const needsPreviewImport = hasInPreviewFields(componentData.props || componentData.schema);
  
  if (needsPreviewImport) {
    imports.push(`import { preview } from ${q}@inkeep/agents-core${q}${semi}`);
  }
  
  imports.push(`import { artifactComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have schema/props
  if (componentData.props || componentData.schema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate export definition for an artifact component (without imports)
 */
export function generateArtifactComponentExport(
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
  const globalEntry = componentNameMap?.get(`artifactComponent:${componentId}`);
  if (!globalEntry) {
    throw new Error(`Artifact component ${componentId} not found in componentNameMap - this indicates a bug in the deterministic system`);
  }
  const componentVarName = globalEntry.name;
  
  // Export the artifact component
  lines.push(`export const ${componentVarName} = artifactComponent({`);
  lines.push(`${indent}id: ${q}${componentId}${q},`);
  lines.push(`${indent}name: ${formatString(componentData.name || componentId, q)},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  if (componentData.type) {
    lines.push(`${indent}type: ${formatString(componentData.type, q)},`);
  }
  
  if (componentData.template) {
    lines.push(`${indent}template: ${formatString(componentData.template, q)},`);
  }
  
  // Add schema/props (always include, use empty object if none provided)
  const schema = componentData.props || componentData.schema;
  if (schema && typeof schema === 'object' && (schema.type || schema.properties || schema.anyOf || schema.allOf)) {
    const formattedSchema = formatArtifactSchema(schema, style, 1);
    
    if (formattedSchema.includes('\n')) {
      // Multi-line schema - format properly with correct indentation
      const schemaLines = formattedSchema.split('\n');
      lines.push(`${indent}props: ${schemaLines[0]}`);
      // For subsequent lines, add base indentation for the artifactComponent level
      for (let i = 1; i < schemaLines.length; i++) {
        lines.push(`${indent}${schemaLines[i]}`);
      }
      // Add comma after the last line
      const lastIndex = lines.length - 1;
      lines[lastIndex] = lines[lastIndex] + ',';
    } else {
      // Single-line schema
      lines.push(`${indent}props: ${formattedSchema},`);
    }
  } else {
    // No valid schema provided, use empty z.object
    lines.push(`${indent}props: z.object({}),`);
  }
  
  // Add config if available
  if (componentData.config && typeof componentData.config === 'object') {
    lines.push(`${indent}config: ${formatConfig(componentData.config, style, 1)}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate an artifact component file from artifact component data
 */
export function generateArtifactComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import statements (alphabetically sorted as per Biome linting)
  // Check if we need preview import by looking for inPreview: true in schema properties
  const needsPreviewImport = hasInPreviewFields(componentData.props || componentData.schema);
  
  if (needsPreviewImport) {
    lines.push(`import { preview } from ${q}@inkeep/agents-core${q}${semi}`);
  }
  lines.push(`import { artifactComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add zod import if we have schema/props
  if (componentData.props || componentData.schema) {
    lines.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  lines.push('');
  
  // Generate variable name (convert to camelCase for artifact components)
  const componentVarName = toArtifactComponentVariableName(componentId);
  
  // Export the artifact component
  lines.push(`export const ${componentVarName} = artifactComponent({`);
  lines.push(`${indent}id: ${q}${componentId}${q},`);
  lines.push(`${indent}name: ${formatString(componentData.name || componentId, q)},`);
  
  if (componentData.description) {
    lines.push(`${indent}description: ${formatString(componentData.description, q)},`);
  }
  
  if (componentData.type) {
    lines.push(`${indent}type: ${formatString(componentData.type, q)},`);
  }
  
  if (componentData.template) {
    lines.push(`${indent}template: ${formatString(componentData.template, q)},`);
  }
  
  // Add schema/props (always include, use empty object if none provided)
  const schema = componentData.props || componentData.schema;
  if (schema && typeof schema === 'object' && (schema.type || schema.properties || schema.anyOf || schema.allOf)) {
    const formattedSchema = formatArtifactSchema(schema, style, 1);
    
    if (formattedSchema.includes('\n')) {
      // Multi-line schema - format properly with correct indentation
      const schemaLines = formattedSchema.split('\n');
      lines.push(`${indent}props: ${schemaLines[0]}`);
      // For subsequent lines, add base indentation for the artifactComponent level
      for (let i = 1; i < schemaLines.length; i++) {
        lines.push(`${indent}${schemaLines[i]}`);
      }
      // Add comma after the last line
      const lastIndex = lines.length - 1;
      lines[lastIndex] = lines[lastIndex] + ',';
    } else {
      // Single-line schema
      lines.push(`${indent}props: ${formattedSchema},`);
    }
  } else {
    // No valid schema provided, use empty z.object
    lines.push(`${indent}props: z.object({}),`);
  }
  
  // Add config if available
  if (componentData.config && typeof componentData.config === 'object') {
    lines.push(`${indent}config: ${formatConfig(componentData.config, style, 1)}`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Check if schema has any properties with inPreview: true
 */
function hasInPreviewFields(schema: any): boolean {
  if (!schema || typeof schema !== 'object' || schema.type !== 'object' || !schema.properties) {
    return false;
  }
  
  for (const prop of Object.values(schema.properties) as any[]) {
    if (prop.inPreview === true) {
      return true;
    }
  }
  
  return false;
}

/**
 * Convert artifact component ID to camelCase variable name (like the examples)
 * Examples: 'document-template' -> 'documentTemplate'
 */
function toArtifactComponentVariableName(id: string): string {
  // For artifact components, use camelCase conversion instead of underscores
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Format an artifact schema with preview() wrappers based on inPreview: true in properties
 */
function formatArtifactSchema(schema: any, style: CodeStyle, indentLevel: number): string {
  if (!schema || typeof schema !== 'object') {
    return 'z.unknown()';
  }

  // For object schemas, we need to handle inPreview fields specially
  if (schema.type === 'object' && schema.properties) {
    const baseIndent = style.indentation.repeat(indentLevel);
    const indent = style.indentation.repeat(indentLevel + 1);
    
    const lines: string[] = ['z.object({'];
    
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      // Get the base Zod type using json-schema-to-zod converter
      const baseZodType = formatZodSchema(prop, style, 0);
      
      // Wrap with preview() if this property has inPreview: true
      const finalZodType = prop.inPreview === true ? `preview(${baseZodType})` : baseZodType;
      
      lines.push(`${indent}${key}: ${finalZodType},`);
    }
    
    lines.push(`${baseIndent}})`);
    
    // Add description if available
    if (schema.description) {
      return lines.join('\n') + `.describe(\`${schema.description}\`)`;
    }
    
    return lines.join('\n');
  }
  
  // For non-object schemas, just use the regular formatter
  return formatZodSchema(schema, style, indentLevel);
}

/**
 * Format a config object as TypeScript code
 */
function formatConfig(config: any, style: CodeStyle, indentLevel: number): string {
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  const q = style.quotes === 'single' ? "'" : '"';
  
  if (typeof config !== 'object' || config === null) {
    return JSON.stringify(config);
  }
  
  if (Array.isArray(config)) {
    const lines: string[] = ['['];
    for (const item of config) {
      if (typeof item === 'object') {
        lines.push(`${indent}${formatConfig(item, style, indentLevel + 1)},`);
      } else if (typeof item === 'string') {
        lines.push(`${indent}${formatString(item, q)},`);
      } else {
        lines.push(`${indent}${JSON.stringify(item)},`);
      }
    }
    lines.push(`${baseIndent}]`);
    return lines.join('\n');
  }
  
  const lines: string[] = ['{'];
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${key}: ${formatConfig(value, style, indentLevel + 1)},`);
    } else if (typeof value === 'string') {
      lines.push(`${indent}${key}: ${formatString(value, q)},`);
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(value)},`);
    }
  }
  lines.push(`${baseIndent}}`);
  
  return lines.join('\n');
}