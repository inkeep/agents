/**
 * Artifact Component Generator - Generate artifact component definitions
 *
 * Generates artifact components using the artifactComponent() builder function from @inkeep/agents-sdk
 * Handles isPreview flag with preview() function wrapper from @inkeep/agents-core
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
 * Format artifact schema with preview() wrappers based on inPreview: true in properties
 */
function formatArtifactSchema(schema: any, style: CodeStyle): string {
  if (!schema || typeof schema !== 'object') {
    return 'z.any()';
  }

  // For object schemas, we need to handle inPreview fields specially
  if (schema.type === 'object' && schema.properties) {
    const { indentation } = style;
    const lines: string[] = ['z.object({'];

    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      // Create a clean copy without inPreview for the converter
      const propCopy = { ...prop };
      delete propCopy.inPreview;

      // Convert the base property to Zod
      const baseZodType = convertJsonSchemaToZod(propCopy);

      // Wrap with preview() if this property has inPreview: true
      const finalZodType = prop.inPreview === true ? `preview(${baseZodType})` : baseZodType;

      lines.push(`${indentation}${key}: ${finalZodType},`);
    }

    lines.push('})');

    // Add description if available
    if (schema.description) {
      return lines.join('\n') + `.describe(\`${schema.description}\`)`;
    }

    return lines.join('\n');
  }

  // For non-object schemas, just use regular conversion
  return convertJsonSchemaToZod(schema);
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
 * Generate Artifact Component Definition using artifactComponent() builder function
 */
export function generateArtifactComponentDefinition(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  // Validate required parameters
  if (!componentId || typeof componentId !== 'string') {
    throw new Error('componentId is required and must be a string');
  }

  if (!componentData || typeof componentData !== 'object') {
    throw new Error(`componentData is required for artifact component '${componentId}'`);
  }

  // Validate required artifact component fields
  const requiredFields = ['name', 'description', 'props'];
  const missingFields = requiredFields.filter(
    (field) =>
      !componentData[field] || componentData[field] === null || componentData[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for artifact component '${componentId}': ${missingFields.join(', ')}`
    );
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  const componentVarName = toCamelCase(componentId);
  const lines: string[] = [];

  lines.push(`export const ${componentVarName} = artifactComponent({`);
  lines.push(`${indentation}id: ${formatString(componentId, q)},`);

  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(componentData.name, q)},`);
  lines.push(`${indentation}description: ${formatString(componentData.description, q, true)},`);

  // Props schema (convert from JSON schema to zod with preview() wrappers)
  // Artifact components use either `props` or `schema` field from componentData
  const schema = componentData.props || componentData.schema;
  if (schema) {
    const zodSchema = formatArtifactSchema(schema, style);
    // Handle multiline schemas with proper indentation
    if (zodSchema.includes('\n')) {
      const schemaLines = zodSchema.split('\n');
      lines.push(`${indentation}props: ${schemaLines[0]}`);
      schemaLines.slice(1, -1).forEach((line) => {
        lines[lines.length - 1] += '\n' + indentation + line;
      });
      lines[lines.length - 1] += '\n' + indentation + schemaLines[schemaLines.length - 1] + ',';
    } else {
      lines.push(`${indentation}props: ${zodSchema},`);
    }
  }

  // Template (for rendering the artifact)
  if (componentData.template) {
    lines.push(`${indentation}template: ${formatString(componentData.template, q, true)},`);
  }

  // Content type
  if (componentData.contentType) {
    lines.push(`${indentation}contentType: ${formatString(componentData.contentType, q)},`);
  }

  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }

  lines.push(`})${semi}`);

  return lines.join('\n');
}

/**
 * Generate imports needed for an artifact component file
 */
export function generateArtifactComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];

  // Check if we need preview import
  const schema = componentData.props || componentData.schema;
  const needsPreviewImport = hasInPreviewFields(schema);

  if (needsPreviewImport) {
    imports.push(`import { preview } from ${q}@inkeep/agents-core${q}${semi}`);
  }

  // Always import artifactComponent from SDK
  imports.push(`import { artifactComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);

  // Add zod import if we have schema/props
  if (schema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }

  return imports;
}

/**
 * Generate complete artifact component file (imports + definition)
 */
export function generateArtifactComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateArtifactComponentImports(componentId, componentData, style);
  const definition = generateArtifactComponentDefinition(componentId, componentData, style);

  return imports.join('\n') + '\n\n' + definition + '\n';
}
