/**
 * Function Tool Generator - Generate function tool definitions
 * 
 * Generates function tools using the functionTool() builder function from @inkeep/agents-sdk
 * Function tools contain inline JavaScript execution functions
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
 * Format JavaScript function code with proper indentation
 */
function formatExecuteFunction(executeCode: string, indentation: string): string {
  if (!executeCode || typeof executeCode !== 'string') {
    return `async ({}) => {\n${indentation}  // TODO: Implement function logic\n${indentation}  return {};\n${indentation}}`;
  }
  
  const trimmedCode = executeCode.trim();
  
  // Check if it's already properly formatted (contains newlines)
  if (trimmedCode.includes('\n')) {
    // Split by lines and add proper indentation
    const lines = trimmedCode.split('\n');
    return lines.map((line, index) => {
      if (index === 0) return line; // First line already has proper position
      return indentation + line;
    }).join('\n');
  }
  
  // For minified/compressed code, we need to format it properly
  // If it's a complete function (starts with async or function), use it as-is but format
  if (trimmedCode.startsWith('async') || trimmedCode.startsWith('function')) {
    // This is likely compressed - just return it as a single line
    // The code formatter (Biome) will handle the proper formatting
    return trimmedCode;
  }
  
  // If it's just code, wrap it in an async function
  return `async ({}) => {\n${indentation}  ${executeCode.replace(/\n/g, `\n${indentation}  `)}\n${indentation}}`;
}

/**
 * Generate Function Tool Definition using functionTool() builder function
 */
export function generateFunctionToolDefinition(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  // Validate required parameters
  if (!toolId || typeof toolId !== 'string') {
    throw new Error('toolId is required and must be a string');
  }
  
  if (!toolData || typeof toolData !== 'object') {
    throw new Error(`toolData is required for function tool '${toolId}'`);
  }
  
  // Validate required function tool fields
  const requiredFields = ['name', 'inputSchema', 'executeCode'];
  const missingFields = requiredFields.filter(field => 
    !toolData[field] || toolData[field] === null || toolData[field] === undefined
  );
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields for function tool '${toolId}': ${missingFields.join(', ')}`);
  }
  
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const toolVarName = toCamelCase(toolId);
  const lines: string[] = [];
  
  lines.push(`export const ${toolVarName} = functionTool({`);
  
  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(toolData.name, q)},`);
  
  if (toolData.description) {
    lines.push(`${indentation}description: ${formatString(toolData.description, q, true)},`);
  }
  
  // Input schema (convert from JSON schema to plain object for functionTool)
  // Function tools use plain JSON schema objects, not Zod
  const inputSchema = toolData.inputSchema || toolData.schema;
  if (inputSchema) {
    const schemaStr = JSON.stringify(inputSchema, null, 2);
    // Format with proper indentation
    const formattedSchema = schemaStr.split('\n').map((line, index) => {
      if (index === 0) return `${indentation}inputSchema: ${line}`;
      return `${indentation}${line}`;
    }).join('\n');
    lines.push(formattedSchema + ',');
  }
  
  // Execute function - this is the actual JavaScript code
  const executeCode = toolData.executeCode || toolData.execute;
  if (executeCode) {
    const executeFunc = formatExecuteFunction(executeCode, indentation);
    lines.push(`${indentation}execute: ${executeFunc},`);
  } else {
    // Provide a default implementation
    lines.push(`${indentation}execute: async ({}) => {`);
    lines.push(`${indentation}  // TODO: Implement function logic`);
    lines.push(`${indentation}  return {};`);
    lines.push(`${indentation}},`);
  }
  
  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  const result = lines.join('\n');
  return result;
}

/**
 * Generate imports needed for a function tool file
 */
export function generateFunctionToolImports(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import functionTool from SDK
  imports.push(`import { functionTool } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  return imports;
}

/**
 * Generate complete function tool file (imports + definition)
 */
export function generateFunctionToolFile(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateFunctionToolImports(toolId, toolData, style);
  const definition = generateFunctionToolDefinition(toolId, toolData, style);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}