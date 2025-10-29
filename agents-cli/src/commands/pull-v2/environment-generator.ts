/**
 * Deterministic environment generator - creates TypeScript environment files from FullProjectDefinition
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  formatString 
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Extract all credential references from a project
 * Scans tools, agents, and explicit credentialReferences to find all used credentials
 */
export function extractAllCredentialReferences(projectData: FullProjectDefinition): Record<string, any> {
  const allCredentials: Record<string, any> = {};
  
  // Start with explicit credential references from the project
  if (projectData.credentialReferences) {
    for (const [credId, credData] of Object.entries(projectData.credentialReferences)) {
      allCredentials[credId] = credData;
    }
  }
  
  // Extract credentials from tools
  if (projectData.tools) {
    for (const [toolId, toolData] of Object.entries(projectData.tools)) {
      if ((toolData as any).credentialReferenceId) {
        const credId = (toolData as any).credentialReferenceId;
        if (!allCredentials[credId]) {
          // Create a minimal credential reference if not already defined
          allCredentials[credId] = {
            id: credId,
            type: 'keychain',
            description: `Credential for ${toolId}`,
            retrievalParams: {
              key: credId.replace(/[^a-zA-Z0-9]/g, '_')
            }
          };
        }
      }
    }
  }
  
  // Extract credentials from functionTools
  if (projectData.functionTools) {
    for (const [toolId, toolData] of Object.entries(projectData.functionTools)) {
      if ((toolData as any).credentialReferenceId) {
        const credId = (toolData as any).credentialReferenceId;
        if (!allCredentials[credId]) {
          allCredentials[credId] = {
            id: credId,
            type: 'keychain',
            description: `Credential for ${toolId}`,
            retrievalParams: {
              key: credId.replace(/[^a-zA-Z0-9]/g, '_')
            }
          };
        }
      }
    }
  }
  
  // Extract credentials from agents' contextConfig
  if (projectData.agents) {
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      const contextConfig = (agentData as any).contextConfig;
      if (contextConfig?.contextVariables) {
        for (const [varName, contextVar] of Object.entries(contextConfig.contextVariables)) {
          if ((contextVar as any).credentialReferenceId) {
            const credId = (contextVar as any).credentialReferenceId;
            if (!allCredentials[credId]) {
              allCredentials[credId] = {
                id: credId,
                type: 'keychain',
                description: `Credential for ${agentId} context variable ${varName}`,
                retrievalParams: {
                  key: credId.replace(/[^a-zA-Z0-9]/g, '_')
                }
              };
            }
          }
        }
      }
    }
  }
  
  return allCredentials;
}

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
  const dotEnvFile = generateDotEnvFile(credentialReferences);
  
  return { 
    'index.ts': indexFile, 
    [environmentFileName]: environmentFile,
    '../.env': dotEnvFile  // Generate .env in project root (parent of environments/)
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
 * Generate .env file with placeholder values
 * This allows the project to load immediately without configuration errors
 */
export function generateDotEnvFile(
  credentialReferences: Record<string, any>
): string {
  const lines: string[] = [];
  
  lines.push('# Environment variables for Inkeep Agents');
  lines.push('# Replace these placeholder values with your actual credentials');
  lines.push('');
  
  if (Object.keys(credentialReferences).length === 0) {
    lines.push('# No credentials required for this project');
    return lines.join('\n') + '\n';
  }
  
  // Add credentials with placeholder values
  for (const [credId, credData] of Object.entries(credentialReferences)) {
    const retrievalKey = credData.retrievalParams?.key || credId.replace(/[^a-zA-Z0-9]/g, '_');
    const description = credData.description ? ` - ${credData.description}` : '';
    
    lines.push(`# ${credId}${description}`);
    lines.push(`${retrievalKey}=placeholder-${credId}-replace-with-real-value`);
    lines.push('');
  }
  
  return lines.join('\n');
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