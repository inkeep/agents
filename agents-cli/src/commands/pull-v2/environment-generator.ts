/**
 * Deterministic environment generator - creates TypeScript environment files from FullProjectDefinition
 */

import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  formatString 
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate environment files for a specific environment (e.g., 'development', 'production')
 */
export function generateEnvironmentFiles(
  targetEnvironment: string,
  credentialReferences: Record<string, any> = {},
  style: CodeStyle = DEFAULT_CODE_STYLE
): Record<string, string> {
  const indexFile = generateEnvironmentIndex(targetEnvironment, style);
  const environmentFile = generateEnvironmentFile(targetEnvironment, credentialReferences, style);
  const environmentFileName = `${targetEnvironment}.env.ts`;
  
  return { 
    'index.ts': indexFile, 
    [environmentFileName]: environmentFile
  };
}

/**
 * Generate the environments/index.ts file that exports the target environment
 */
export function generateEnvironmentIndex(
  targetEnvironment: string,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import SDK function and the target environment file
  lines.push(`import { createEnvironmentSettings } from ${q}@inkeep/agents-sdk${q}${semi}`);
  lines.push(`import { ${targetEnvironment} } from ${q}./${targetEnvironment}.env${q}${semi}`);
  
  lines.push('');
  
  // Export environment settings
  lines.push(`export const envSettings = createEnvironmentSettings({`);
  lines.push(`  ${targetEnvironment},`);
  lines.push(`})${semi}`);
  
  lines.push('');
  
  // Export individual environment for direct access
  lines.push(`export { ${targetEnvironment} }${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Generate a specific environment file (e.g., development.env.ts)
 */
export function generateEnvironmentFile(
  environmentName: string,
  credentialReferences: Record<string, any>,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import statements
  lines.push(`import { credential, registerEnvironmentSettings } from ${q}@inkeep/agents-sdk${q}${semi}`);
  lines.push('');
  
  // Export the environment using registerEnvironmentSettings
  lines.push(`export const ${environmentName} = registerEnvironmentSettings({`);
  
  // Add credentials section
  lines.push(`${indent}credentials: {`);
  
  if (Object.keys(credentialReferences).length > 0) {
    for (const [credId, credData] of Object.entries(credentialReferences)) {
      // Convert credential ID to camelCase variable name
      const credVarName = credId.replace(/[-_](.)/g, (_, char) => char.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
      const credType = credData.type || 'keychain';
      const credStoreId = getDefaultCredentialStoreId(credType);
      const retrievalKey = getRetrievalKey(credId, credData);
      
      lines.push(`${indent}${indent}${credVarName}: credential({`);
      lines.push(`${indent}${indent}${indent}id: ${formatString(credId, q)},`);
      lines.push(`${indent}${indent}${indent}type: ${formatString(credType, q)},`);
      lines.push(`${indent}${indent}${indent}credentialStoreId: ${formatString(credStoreId, q)},`);
      lines.push(`${indent}${indent}${indent}retrievalParams: {`);
      lines.push(`${indent}${indent}${indent}${indent}${q}key${q}: ${formatString(retrievalKey, q)}`);
      lines.push(`${indent}${indent}${indent}}`);
      lines.push(`${indent}${indent}}),`);
    }
  }
  
  lines.push(`${indent}}`);
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Get default credential store ID based on type
 */
function getDefaultCredentialStoreId(type: string): string {
  switch (type) {
    case 'keychain':
      return 'keychain-default';
    case 'memory':
      return 'memory-default';
    case 'env':
      return 'env-default';
    default:
      return 'keychain-default';
  }
}

/**
 * Get retrieval key for credential based on ID and data
 */
function getRetrievalKey(credId: string, credData: any): string {
  // If explicit retrieval key is provided, use it
  if (credData.retrievalParams?.key) {
    return credData.retrievalParams.key;
  }
  
  // Otherwise generate from credential ID
  return credId.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Convert credential ID to environment variable name
 * Examples: 'openai-api-key' -> 'OPENAI_API_KEY', 'database-url' -> 'DATABASE_URL'
 */
function credentialIdToEnvVar(credId: string): string {
  return credId
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate environment template file (.env.example) 
 */
export function generateEnvironmentTemplate(
  credentialReferences: Record<string, any>
): string {
  const lines: string[] = [];
  
  lines.push('# Environment variables for Inkeep Agents');
  lines.push('# Copy this file to .env and fill in your actual values');
  lines.push('');
  
  if (Object.keys(credentialReferences).length === 0) {
    lines.push('# No credentials found in project');
    return lines.join('\n') + '\n';
  }
  
  // Group credentials by type for better organization
  const credsByType: Record<string, Array<{ id: string; data: any }>> = {};
  
  for (const [credId, credData] of Object.entries(credentialReferences)) {
    const type = credData.type || 'other';
    if (!credsByType[type]) credsByType[type] = [];
    credsByType[type].push({ id: credId, data: credData });
  }
  
  // Generate sections by type
  for (const [type, creds] of Object.entries(credsByType)) {
    lines.push(`# ${type.toUpperCase()} credentials`);
    
    for (const { id, data } of creds) {
      const envVarName = credentialIdToEnvVar(id);
      const description = data.description ? ` - ${data.description}` : '';
      lines.push(`# ${id}${description}`);
      lines.push(`${envVarName}=your_${id.replace(/[^a-z0-9]/g, '_')}_here`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}