/**
 * Environment Settings Generator - Generate environment settings definitions
 * 
 * Generates environment settings using registerEnvironmentSettings() and createEnvironmentSettings()
 * from @inkeep/agents-sdk. Handles both individual environment files and the main environment index.
 */

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
 * Format credentials object for environment settings
 */
function formatCredentialsObject(credentials: any, style: CodeStyle, indentLevel: number): string {
  if (!credentials || typeof credentials !== 'object') {
    return '{}';
  }
  
  const { quotes, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const baseIndent = indentation.repeat(indentLevel);
  const indent = indentation.repeat(indentLevel + 1);
  const nestedIndent = indentation.repeat(indentLevel + 2);
  
  const lines: string[] = ['{'];
  
  for (const [key, credentialData] of Object.entries(credentials) as [string, any][]) {
    lines.push(`${indent}${formatString(key, q)}: {`);
    
    // Format credential properties
    if (credentialData.id) {
      lines.push(`${nestedIndent}id: ${formatString(credentialData.id, q)},`);
    }
    
    if (credentialData.name) {
      lines.push(`${nestedIndent}name: ${formatString(credentialData.name, q)},`);
    }
    
    // Type - use CredentialStoreType enum or string
    if (credentialData.type) {
      if (typeof credentialData.type === 'string') {
        // If it's a string, we might want to use the enum
        const enumValue = credentialData.type === 'memory' ? 'CredentialStoreType.memory' :
                         credentialData.type === 'env' ? 'CredentialStoreType.env' :
                         credentialData.type === 'keychain' ? 'CredentialStoreType.keychain' :
                         formatString(credentialData.type, q);
        lines.push(`${nestedIndent}type: ${enumValue},`);
      } else {
        lines.push(`${nestedIndent}type: ${credentialData.type},`);
      }
    }
    
    if (credentialData.credentialStoreId) {
      lines.push(`${nestedIndent}credentialStoreId: ${formatString(credentialData.credentialStoreId, q)},`);
    }
    
    if (credentialData.description) {
      lines.push(`${nestedIndent}description: ${formatString(credentialData.description, q)},`);
    }
    
    // Retrieval params
    if (credentialData.retrievalParams) {
      lines.push(`${nestedIndent}retrievalParams: {`);
      for (const [paramKey, paramValue] of Object.entries(credentialData.retrievalParams) as [string, any][]) {
        // Skip null and undefined values
        if (paramValue === null || paramValue === undefined) {
          continue;
        }
        
        if (typeof paramValue === 'string') {
          lines.push(`${nestedIndent}${indent}${paramKey}: ${formatString(paramValue, q)},`);
        } else {
          lines.push(`${nestedIndent}${indent}${paramKey}: ${JSON.stringify(paramValue)},`);
        }
      }
      // Remove trailing comma from last param
      const lastLineIndex = lines.length - 1;
      if (lines[lastLineIndex].endsWith(',')) {
        lines[lastLineIndex] = lines[lastLineIndex].slice(0, -1);
      }
      lines.push(`${nestedIndent}},`);
    }
    
    // Remove trailing comma from last property
    const lastPropIndex = lines.length - 1;
    if (lines[lastPropIndex].endsWith(',')) {
      lines[lastPropIndex] = lines[lastPropIndex].slice(0, -1);
    }
    
    lines.push(`${indent}},`);
  }
  
  // Remove trailing comma from last credential
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`${baseIndent}}`);
  
  return lines.join('\n');
}

/**
 * Generate Individual Environment Settings Definition (development.env.ts, production.env.ts)
 */
export function generateEnvironmentSettingsDefinition(
  environmentName: string,
  environmentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  lines.push(`export const ${environmentName} = registerEnvironmentSettings({`);
  
  // Credentials object
  if (environmentData.credentials && Object.keys(environmentData.credentials).length > 0) {
    const formattedCredentials = formatCredentialsObject(environmentData.credentials, style, 1);
    lines.push(`${indentation}credentials: ${formattedCredentials},`);
  } else {
    lines.push(`${indentation}credentials: {},`);
  }
  
  // Other environment-specific settings can be added here in the future
  // e.g., contextVariables, defaultValues, etc.
  
  // Remove trailing comma from last line
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate Main Environment Settings Index (index.ts)
 */
export function generateEnvironmentIndexDefinition(
  environments: string[],
  style: CodeStyle = DEFAULT_STYLE
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Export envSettings
  lines.push(`export const envSettings = createEnvironmentSettings({`);
  
  for (const envName of environments) {
    lines.push(`${indentation}${envName},`);
  }
  
  // Remove trailing comma from last environment
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports for individual environment settings file
 */
export function generateEnvironmentSettingsImports(
  environmentName: string,
  environmentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import registerEnvironmentSettings
  imports.push(`import { registerEnvironmentSettings } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Check if we need CredentialStoreType enum
  const needsCredentialStoreType = environmentData.credentials && 
    Object.values(environmentData.credentials).some((cred: any) => 
      typeof cred.type === 'string' && ['memory', 'env', 'keychain'].includes(cred.type)
    );
  
  if (needsCredentialStoreType) {
    imports.push(`import { CredentialStoreType } from ${q}@inkeep/agents-core${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate imports for main environment index file
 */
export function generateEnvironmentIndexImports(
  environments: string[],
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Import createEnvironmentSettings
  imports.push(`import { createEnvironmentSettings } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Import individual environments
  for (const envName of environments) {
    imports.push(`import { ${envName} } from ${q}./${envName}.env${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate complete environment settings file
 */
export function generateEnvironmentSettingsFile(
  environmentName: string,
  environmentData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateEnvironmentSettingsImports(environmentName, environmentData, style);
  const definition = generateEnvironmentSettingsDefinition(environmentName, environmentData, style);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}

/**
 * Generate complete environment index file
 */
export function generateEnvironmentIndexFile(
  environments: string[],
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateEnvironmentIndexImports(environments, style);
  const definition = generateEnvironmentIndexDefinition(environments, style);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}

/**
 * Generate environment file (alias for generateEnvironmentSettingsFile)
 * This is the main function used by introspect-generator
 */
export function generateEnvironmentFile(
  environmentName: string,
  environmentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string {
  // If we have a registry and credentials, generate imports and references
  if (registry && environmentData.credentials && Array.isArray(environmentData.credentials)) {
    const { quotes, semicolons, indentation } = style;
    const q = quotes === 'single' ? "'" : '"';
    const semi = semicolons ? ';' : '';
    
    const imports: string[] = [];
    const credentialRefs: string[] = [];
    
    // Always import registerEnvironmentSettings
    imports.push(`import { registerEnvironmentSettings } from ${q}@inkeep/agents-sdk${q}${semi}`);
    
    // Import each credential and collect variable names
    for (const credentialId of environmentData.credentials) {
      const credentialComponent = registry.get(credentialId);
      if (credentialComponent) {
        const relativePath = `../credentials/${credentialId}`;
        imports.push(`import { ${credentialComponent.name} } from ${q}${relativePath}${q}${semi}`);
        credentialRefs.push(credentialComponent.name);
      }
    }
    
    const lines: string[] = [];
    
    // Add imports
    lines.push(...imports);
    lines.push(''); // Empty line after imports
    
    // Generate environment settings with credential references
    lines.push(`export const ${environmentName} = registerEnvironmentSettings({`);
    
    if (credentialRefs.length > 0) {
      lines.push(`${indentation}credentials: {`);
      for (let i = 0; i < environmentData.credentials.length; i++) {
        const credentialId = environmentData.credentials[i];
        const credentialVarName = credentialRefs[i];
        const isLast = i === credentialRefs.length - 1;
        // Use registry's variable name for the key to ensure valid JavaScript property name
        const validKey = registry.getVariableName(credentialId);
        lines.push(`${indentation}${indentation}${validKey}: ${credentialVarName}${isLast ? '' : ','}`);
      }
      lines.push(`${indentation}}`);
    } else {
      lines.push(`${indentation}credentials: {}`);
    }
    
    lines.push(`})${semi}`);
    lines.push(''); // Empty line at end
    
    return lines.join('\n');
  }
  
  return generateEnvironmentSettingsFile(environmentName, environmentData, style);
}