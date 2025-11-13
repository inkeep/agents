/**
 * Data Component Generator - Generate data component definitions
 *
 * Generates data components using the dataComponent() builder function from @inkeep/agents-sdk
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
 * Generate Data Component Definition using dataComponent() builder function
 */
export function generateDataComponentDefinition(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  // Validate required parameters
  if (!componentId || typeof componentId !== 'string') {
    throw new Error('componentId is required and must be a string');
  }

  if (!componentData || typeof componentData !== 'object') {
    throw new Error(`componentData is required for data component '${componentId}'`);
  }

  // Validate required data component fields
  const requiredFields = ['name', 'description', 'props'];
  const missingFields = requiredFields.filter(
    (field) =>
      !componentData[field] || componentData[field] === null || componentData[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for data component '${componentId}': ${missingFields.join(', ')}`
    );
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  const componentVarName = toCamelCase(componentId);
  const lines: string[] = [];

  lines.push(`export const ${componentVarName} = dataComponent({`);
  lines.push(`${indentation}id: ${formatString(componentId, q)},`);

  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(componentData.name, q)},`);
  lines.push(`${indentation}description: ${formatString(componentData.description, q, true)},`);

  // Props schema (convert from JSON schema to zod using existing utility)
  // Pull-v2 shows that dataComponent uses either `props` or `schema` field from componentData
  const schema = componentData.props || componentData.schema;
  if (schema) {
    const zodSchema = convertJsonSchemaToZod(schema);
    lines.push(`${indentation}props: ${zodSchema},`);
  }

  // Render attribute - handle { component: string, mockData: object }
  if (componentData.render && typeof componentData.render === 'object') {
    const render = componentData.render;
    if (render.component && typeof render.component === 'string') {
      lines.push(`${indentation}render: {`);

      // For complex render components, use JSON.stringify to properly escape as string
      const componentString = JSON.stringify(render.component);
      lines.push(`${indentation}${indentation}component: ${componentString},`);

      // Add mockData if present
      if (render.mockData && typeof render.mockData === 'object') {
        const mockDataStr = JSON.stringify(render.mockData, null, 2);
        const formattedMockData = mockDataStr
          .split('\n')
          .map((line, index) => {
            if (index === 0) return line;
            return `${indentation}${indentation}${line}`;
          })
          .join('\n');
        lines.push(`${indentation}${indentation}mockData: ${formattedMockData},`);
      }

      lines.push(`${indentation}},`);
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
 * Generate imports needed for a data component file
 */
export function generateDataComponentImports(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];

  // Always import dataComponent from SDK
  imports.push(`import { dataComponent } from ${q}@inkeep/agents-sdk${q}${semi}`);

  // Add zod import if we have schema/props
  const schema = componentData.props || componentData.schema;
  if (schema) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }

  return imports;
}

/**
 * Generate complete data component file (imports + definition)
 */
export function generateDataComponentFile(
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateDataComponentImports(componentId, componentData, style);
  const definition = generateDataComponentDefinition(componentId, componentData, style);

  return imports.join('\n') + '\n\n' + definition + '\n';
}
