/**
 * Context Config Generator - Generate contextConfig definitions
 * 
 * Generates contextConfig using contextConfig(), headers(), and fetchDefinition() 
 * builder functions from @inkeep/agents-core
 */

import { jsonSchemaToZod } from 'json-schema-to-zod';
import chalk from 'chalk';
import {
  CodeStyle,
  DEFAULT_STYLE,
  toCamelCase,
  formatString,
  formatObject,
  hasTemplateVariables,
  formatPromptWithContext,
  removeTrailingComma,
  generateImport,
  shouldInclude,
  generateFileContent
} from '../utils/generator-utils';
import type { ComponentRegistry } from '../utils/component-registry';

/**
 * Process template variables in fetchConfig objects
 */
function processFetchConfigTemplates(fetchConfig: any, headersVarName: string): string {
  const processValue = (value: any): string => {
    if (typeof value === 'string') {
      if (hasTemplateVariables(value)) {
        // Convert {{headers.field}} to ${headers.toTemplate("field")} syntax
        const convertedStr = value.replace(/\{\{headers\.([^}]+)\}\}/g, `\${${headersVarName}.toTemplate("$1")}`);
        return `\`${convertedStr.replace(/`/g, '\\`')}\``;
      } else {
        return `'${value.replace(/'/g, "\\'")}'`;
      }
    } else if (typeof value === 'object' && value !== null) {
      return processObject(value);
    } else {
      return JSON.stringify(value);
    }
  };

  const processObject = (obj: any): string => {
    if (Array.isArray(obj)) {
      const items = obj.map(item => processValue(item)).join(', ');
      return `[${items}]`;
    }
    
    const entries = Object.entries(obj).map(([key, val]) => {
      const processedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
      return `${processedKey}: ${processValue(val)}`;
    });
    
    return `{\n    ${entries.join(',\n    ')}\n  }`;
  };

  return processObject(fetchConfig);
}

/**
 * Generate Headers Definition using headers() builder function
 */
export function generateHeadersDefinition(
  headersId: string,
  headersData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const headersVarName = toCamelCase(headersId);
  const lines: string[] = [];
  
  lines.push(`const ${headersVarName} = headers({`);
  
  // Schema - convert JSON Schema to Zod
  if (headersData.schema) {
    const zodSchema = jsonSchemaToZod(headersData.schema, { module: 'none' });
    lines.push(`${indentation}schema: ${zodSchema},`);
  }
  
  // Remove trailing comma from last line
  removeTrailingComma(lines);
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate Fetch Definition using fetchDefinition() builder function
 */
export function generateFetchDefinitionDefinition(
  fetchId: string,
  fetchData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const fetchVarName = toCamelCase(fetchId);
  const lines: string[] = [];
  
  lines.push(`const ${fetchVarName} = fetchDefinition({`);
  
  // id
  lines.push(`${indentation}id: ${formatString(fetchData.id || fetchId, q)},`);
  
  // name
  if (fetchData.name) {
    lines.push(`${indentation}name: ${formatString(fetchData.name, q)},`);
  }
  
  // trigger
  if (fetchData.trigger) {
    lines.push(`${indentation}trigger: ${formatString(fetchData.trigger, q)},`);
  }
  
  // fetchConfig - handle template variables in URLs and headers
  if (fetchData.fetchConfig) {
    const processedFetchConfig = processFetchConfigTemplates(fetchData.fetchConfig, 'headersSchema');
    lines.push(`${indentation}fetchConfig: ${processedFetchConfig},`);
  }
  
  // responseSchema - convert JSON Schema to Zod
  if (fetchData.responseSchema) {
    const zodSchema = jsonSchemaToZod(fetchData.responseSchema, { module: 'none' });
    lines.push(`${indentation}responseSchema: ${zodSchema},`);
  }
  
  // defaultValue
  if (fetchData.defaultValue) {
    if (typeof fetchData.defaultValue === 'string') {
      lines.push(`${indentation}defaultValue: ${formatString(fetchData.defaultValue, q)},`);
    } else {
      lines.push(`${indentation}defaultValue: ${JSON.stringify(fetchData.defaultValue)},`);
    }
  }
  
  // Remove trailing comma from last line
  removeTrailingComma(lines);
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate Context Config Definition using contextConfig() builder function
 */
export function generateContextConfigDefinition(
  contextId: string,
  contextData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry: ComponentRegistry,
  agentId?: string
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const contextVarName = agentId ? `${toCamelCase(agentId)}Context` : (registry?.getVariableName(contextId) || toCamelCase(contextId));
  const lines: string[] = [];
  
  lines.push(`const ${contextVarName} = contextConfig({`);
  
  // Always include the id from the database
  if (contextData.id) {
    lines.push(`${indentation}id: ${formatString(contextData.id, q)},`);
  }

  // headers - reference to headers variable
  if (contextData.headersSchema) {
    lines.push(`${indentation}headers: headersSchema,`);
  }
  
  // contextVariables - reference to fetch definition variables
  if (contextData.contextVariables) {
    const contextVarLines = [`${indentation}contextVariables: {`];
    
    for (const [varName, varData] of Object.entries(contextData.contextVariables) as [string, any][]) {
      if (varData && typeof varData === 'object' && (varData.fetchConfig || varData.responseSchema)) {
        // Reference the fetchDefinition variable instead of duplicating its data
        contextVarLines.push(`${indentation}  ${varName},`);
      }
    }
    
    // Remove trailing comma from last line
    if (contextVarLines[contextVarLines.length - 1].endsWith(',')) {
      contextVarLines[contextVarLines.length - 1] = contextVarLines[contextVarLines.length - 1].slice(0, -1);
    }
    
    contextVarLines.push(`${indentation}},`);
    lines.push(...contextVarLines);
  }
  
  // Remove trailing comma from last line
  removeTrailingComma(lines);
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for a context config file
 */
export function generateContextConfigImports(
  contextId: string,
  contextData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const imports: string[] = [];
  
  // Core imports from @inkeep/agents-core
  const coreImports: string[] = [];
  
  // Check what we need to import based on the context data
  if (contextData.headers || hasHeadersInData(contextData)) {
    coreImports.push('headers');
  }
  
  if (contextData.contextVariables && hasFetchDefinitionsInData(contextData)) {
    coreImports.push('fetchDefinition');
  }
  
  // Always need contextConfig
  coreImports.push('contextConfig');
  
  if (coreImports.length > 0) {
    imports.push(generateImport(coreImports, '@inkeep/agents-core', style));
  }
  
  // Import zod for schema validation
  if (hasSchemas(contextData)) {
    imports.push(generateImport(['z'], 'zod', style));
  }
  
  return imports;
}

/**
 * Helper functions to detect what imports are needed
 */
function hasHeadersInData(contextData: any): boolean {
  return !!contextData.headers || JSON.stringify(contextData).includes('headers');
}

function hasFetchDefinitionsInData(contextData: any): boolean {
  return JSON.stringify(contextData).includes('fetchDefinition') || 
         (contextData.contextVariables && Object.values(contextData.contextVariables).some((v: any) => 
           v && typeof v === 'object' && (v.fetchConfig || v.responseSchema)
         ));
}

function hasSchemas(contextData: any): boolean {
  const dataStr = JSON.stringify(contextData).toLowerCase();
  return dataStr.includes('schema') || dataStr.includes('responseschema');
}

/**
 * Generate complete context config file (imports + all definitions)
 */
export function generateContextConfigFile(
  contextId: string,
  contextData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  agentId?: string
): string {
  const imports = generateContextConfigImports(contextId, contextData, style);
  const definitions: string[] = [];
  
  // Generate headers if present
  if (contextData.headersSchema) {
    const headersDefinition = generateHeadersDefinition('headersSchema', { schema: contextData.headersSchema }, style);
    definitions.push(headersDefinition);
  }
  
  // Generate fetch definitions if present
  if (contextData.contextVariables) {
    for (const [varName, varData] of Object.entries(contextData.contextVariables) as [string, any][]) {
      if (varData && typeof varData === 'object' && (varData.fetchConfig || varData.responseSchema)) {
        const fetchDefinition = generateFetchDefinitionDefinition(varName, varData, style);
        definitions.push(fetchDefinition);
      }
    }
  }
  
  // Generate main context config
  const contextDefinition = generateContextConfigDefinition(contextId, contextData, style, registry!, agentId);
  definitions.push(contextDefinition);
  
  // Export the main context config, headersSchema, and any fetch definitions
  const contextVarName = agentId ? `${toCamelCase(agentId)}Context` : (registry?.getVariableName(contextId) || toCamelCase(contextId));
  const exports: string[] = [contextVarName];
  
  if (contextData.headersSchema) {
    exports.push('headersSchema');
  }
  
  // Also export any fetch definition variables
  if (contextData.contextVariables) {
    for (const [varName, varData] of Object.entries(contextData.contextVariables) as [string, any][]) {
      if (varData && typeof varData === 'object' && (varData.fetchConfig || varData.responseSchema)) {
        exports.push(varName);
      }
    }
  }
  
  definitions.push(`export { ${exports.join(', ')} };`);
  
  return generateFileContent(imports, definitions);
}