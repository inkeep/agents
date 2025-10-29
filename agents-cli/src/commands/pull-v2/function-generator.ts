/**
 * Deterministic function generator - creates TypeScript function files from function data
 */

import {
  type CodeStyle,
  DEFAULT_CODE_STYLE,
  formatString,
  toVariableName,
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate imports needed for a function
 */
export function generateFunctionImports(
  _functionId: string,
  _functionData: any,
  additionalImports: string[] = [],
  style: CodeStyle = DEFAULT_CODE_STYLE
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];

  // Always import functionTool
  imports.push(`import { functionTool } from ${q}@inkeep/agents-sdk${q}${semi}`);

  // Add any additional imports passed in
  imports.push(...additionalImports);

  return imports;
}

/**
 * Generate export definition for a function (without imports)
 */
export function generateFunctionExport(
  functionId: string,
  functionData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  isInline: boolean = false
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';

  const lines: string[] = [];
  const functionVarName = toVariableName(functionId);

  // Skip export keyword if inline
  const exportKeyword = isInline ? '' : 'export ';
  lines.push(`${exportKeyword}const ${functionVarName} = functionTool({`);

  // Add name (REQUIRED by FunctionToolConfig - no id field exists)
  // The FunctionTool class generates the id from the name
  const toolName = functionData.name || functionId;
  lines.push(`${indent}name: ${formatString(toolName, q)},`);

  // Add description (REQUIRED by FunctionToolConfig)
  const description = functionData.description || '';
  lines.push(`${indent}description: ${formatString(description, q)},`);

  // Add inputSchema (REQUIRED by FunctionToolConfig)
  // Map from 'parameters' field name to 'inputSchema'
  const inputSchema = functionData.parameters || functionData.inputSchema || {};
  if (typeof inputSchema === 'string') {
    lines.push(`${indent}inputSchema: ${inputSchema},`);
  } else {
    lines.push(
      `${indent}inputSchema: ${JSON.stringify(inputSchema, null, 2)
        .split('\n')
        .join('\n' + indent)},`
    );
  }

  // Add dependencies (OPTIONAL by FunctionToolConfig)
  if (functionData.dependencies) {
    lines.push(
      `${indent}dependencies: ${JSON.stringify(functionData.dependencies, null, 2)
        .split('\n')
        .join('\n' + indent)},`
    );
  }

  // Add execute (REQUIRED by FunctionToolConfig)
  // Map from 'implementation' field name to 'execute'
  const execute = functionData.implementation || functionData.execute;
  if (execute) {
    lines.push(`${indent}execute: ${execute},`);
  } else {
    // If no implementation provided, create a placeholder
    lines.push(`${indent}execute: async (params: any) => {`);
    lines.push(`${indent}${indent}throw new Error(${formatString('Not implemented', q)});`);
    lines.push(`${indent}},`);
  }

  lines.push(`})${semi}`);

  return lines.join('\n');
}

/**
 * Generate complete function file with imports and exports
 */
export function generateFunctionFile(
  functionId: string,
  functionData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  additionalImports: string[] = []
): string {
  const imports = generateFunctionImports(functionId, functionData, additionalImports, style);
  const exportDef = generateFunctionExport(functionId, functionData, style);

  const lines: string[] = [];

  // Add imports
  if (imports.length > 0) {
    lines.push(...imports);
    lines.push(''); // Empty line after imports
  }

  // Add export
  lines.push(exportDef);

  return lines.join('\n') + '\n';
}
