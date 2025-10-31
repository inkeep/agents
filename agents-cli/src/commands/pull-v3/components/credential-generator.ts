/**
 * Credential Generator - Generate credential definitions
 * 
 * Generates credentials using the credential() builder function from @inkeep/agents-sdk
 * Credentials define how to authenticate with external services using various storage mechanisms
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
 * Format retrieval params object
 */
function formatRetrievalParams(retrievalParams: any, style: CodeStyle, indentLevel: number): string {
  if (!retrievalParams || typeof retrievalParams !== 'object') {
    return '{}';
  }
  
  const { quotes, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const baseIndent = indentation.repeat(indentLevel);
  const indent = indentation.repeat(indentLevel + 1);
  
  const lines: string[] = ['{'];
  
  for (const [key, value] of Object.entries(retrievalParams)) {
    if (typeof value === 'string') {
      lines.push(`${indent}${q}${key}${q}: ${formatString(value, q)},`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${indent}${q}${key}${q}: ${JSON.stringify(value)},`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${q}${key}${q}: ${formatRetrievalParams(value, style, indentLevel + 1)},`);
    }
  }
  
  // Remove trailing comma from last line
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`${baseIndent}}`);
  
  return lines.join('\n');
}

/**
 * Generate Credential Definition using credential() builder function
 */
export function generateCredentialDefinition(
  credentialId: string,
  credentialData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const credentialVarName = toCamelCase(credentialId);
  const lines: string[] = [];
  
  lines.push(`export const ${credentialVarName} = credential({`);
  lines.push(`${indentation}id: ${formatString(credentialId, q)},`);
  
  
  // Validate required fields
  const requiredFields = ['name', 'type', 'credentialStoreId'];
  const missingFields = requiredFields.filter(field => 
    !credentialData[field] || credentialData[field] === null || credentialData[field] === undefined
  );
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields for credential '${credentialId}': ${missingFields.join(', ')}`);
  }
  
  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(credentialData.name, q)},`);
  lines.push(`${indentation}type: ${formatString(credentialData.type, q)},`);
  lines.push(`${indentation}credentialStoreId: ${formatString(credentialData.credentialStoreId, q)},`);
  
  if (credentialData.description) {
    lines.push(`${indentation}description: ${formatString(credentialData.description, q, true)},`);
  }
  
  // Retrieval params - how to get the credential from the store
  if (credentialData.retrievalParams) {
    const formattedParams = formatRetrievalParams(credentialData.retrievalParams, style, 1);
    if (formattedParams.includes('\n')) {
      // Multi-line object
      lines.push(`${indentation}retrievalParams: ${formattedParams},`);
    } else {
      lines.push(`${indentation}retrievalParams: ${formattedParams},`);
    }
  } else {
    // Provide default retrieval params based on credential ID
    const defaultKey = credentialId.toUpperCase().replace(/-/g, '_');
    lines.push(`${indentation}retrievalParams: {`);
    lines.push(`${indentation}${indentation}${q}key${q}: ${formatString(defaultKey, q)}`);
    lines.push(`${indentation}},`);
  }
  
  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for a credential file
 */
export function generateCredentialImports(
  credentialId: string,
  credentialData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import credential from SDK
  imports.push(`import { credential } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  return imports;
}

/**
 * Generate complete credential file (imports + definition)
 */
export function generateCredentialFile(
  credentialId: string,
  credentialData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateCredentialImports(credentialId, credentialData, style);
  const definition = generateCredentialDefinition(credentialId, credentialData, style);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}