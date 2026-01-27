/**
 * Trigger Generator - Generate trigger definitions
 *
 * Generates triggers using the Trigger class from @inkeep/agents-sdk
 * Triggers are webhooks that can invoke agent conversations
 */
import {
  type CodeStyle,
  DEFAULT_STYLE,
  formatString,
  generateFileContent,
  generateImport,
  toCamelCase,
} from '../utils/generator-utils';

/**
 * Format authentication configuration
 * New format uses headers array: { headers: [{ name, valueHash, valuePrefix }] }
 * We generate code that uses environment variables for the secret values
 */
function formatAuthentication(auth: any, style: CodeStyle, indentLevel: number): string {
  if (!auth) return '';

  const { indentation, quotes } = style;
  const q = quotes === 'single' ? "'" : '"';
  const indent = indentation.repeat(indentLevel);
  const innerIndent = indentation.repeat(indentLevel + 1);
  const headerIndent = indentation.repeat(indentLevel + 2);
  const lines: string[] = [];

  // New format: headers array
  if (auth.headers && Array.isArray(auth.headers) && auth.headers.length > 0) {
    lines.push(`${indent}authentication: {`);
    lines.push(`${innerIndent}headers: [`);

    for (const header of auth.headers) {
      // Generate environment variable name from header name
      // e.g., "X-API-Key" -> "TRIGGER_AUTH_X_API_KEY"
      const envVarName = `TRIGGER_AUTH_${header.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      lines.push(`${headerIndent}{`);
      lines.push(`${headerIndent}${indentation}name: ${q}${header.name}${q},`);
      lines.push(`${headerIndent}${indentation}value: process.env.${envVarName} || ${q}${q},`);
      lines.push(`${headerIndent}},`);
    }

    lines.push(`${innerIndent}],`);
    lines.push(`${indent}},`);
  }

  return lines.join('\n');
}

/**
 * Format output transform configuration
 */
function formatOutputTransform(transform: any, style: CodeStyle, indentLevel: number): string {
  if (!transform) return '';

  const { indentation } = style;
  const indent = indentation.repeat(indentLevel);
  const innerIndent = indentation.repeat(indentLevel + 1);
  const lines: string[] = [];

  lines.push(`${indent}outputTransform: {`);

  if (transform.jmespath) {
    lines.push(`${innerIndent}jmespath: '${transform.jmespath}',`);
  }

  if (transform.objectTransformation) {
    const transformStr = JSON.stringify(transform.objectTransformation, null, 2);
    const formattedTransform = transformStr
      .split('\n')
      .map((line, index) => {
        if (index === 0) return `${innerIndent}objectTransformation: ${line}`;
        return `${innerIndent}${line}`;
      })
      .join('\n');
    lines.push(`${formattedTransform},`);
  }

  // Remove trailing comma from last line
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }

  lines.push(`${indent}},`);

  return lines.join('\n');
}

/**
 * Format signature verification configuration
 * Generates code for signatureVerification object with all nested structures
 */
function formatSignatureVerification(config: any, style: CodeStyle, indentLevel: number): string {
  if (!config) return '';

  const { indentation, quotes } = style;
  const q = quotes === 'single' ? "'" : '"';
  const indent = indentation.repeat(indentLevel);
  const lines: string[] = [];

  lines.push(`${indent}signatureVerification: {`);

  // Algorithm
  const algorithmIndent = indentation.repeat(indentLevel + 1);
  lines.push(`${algorithmIndent}algorithm: ${formatString(config.algorithm, q)},`);

  // Encoding
  lines.push(`${algorithmIndent}encoding: ${formatString(config.encoding, q)},`);

  // Signature object
  lines.push(`${algorithmIndent}signature: {`);
  const sigIndent = indentation.repeat(indentLevel + 2);
  lines.push(`${sigIndent}source: ${formatString(config.signature.source, q)},`);
  lines.push(`${sigIndent}key: ${formatString(config.signature.key, q)},`);
  if (config.signature.prefix !== undefined && config.signature.prefix !== null) {
    lines.push(`${sigIndent}prefix: ${formatString(config.signature.prefix, q)},`);
  }
  if (config.signature.regex !== undefined && config.signature.regex !== null) {
    lines.push(`${sigIndent}regex: ${formatString(config.signature.regex, q)},`);
  }
  // Remove trailing comma from last signature field
  if (lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push(`${algorithmIndent}},`);

  // Signed components array
  lines.push(`${algorithmIndent}signedComponents: [`);
  for (const component of config.signedComponents) {
    lines.push(`${sigIndent}{`);
    const compIndent = indentation.repeat(indentLevel + 3);
    lines.push(`${compIndent}source: ${formatString(component.source, q)},`);
    if (component.key !== undefined && component.key !== null) {
      lines.push(`${compIndent}key: ${formatString(component.key, q)},`);
    }
    if (component.value !== undefined && component.value !== null) {
      lines.push(`${compIndent}value: ${formatString(component.value, q)},`);
    }
    if (component.regex !== undefined && component.regex !== null) {
      lines.push(`${compIndent}regex: ${formatString(component.regex, q)},`);
    }
    if (component.required !== undefined && component.required !== null) {
      lines.push(`${compIndent}required: ${component.required},`);
    }
    // Remove trailing comma from last component field
    if (lines[lines.length - 1].endsWith(',')) {
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
    }
    lines.push(`${sigIndent}},`);
  }
  lines.push(`${algorithmIndent}],`);

  // Component join
  lines.push(`${algorithmIndent}componentJoin: {`);
  lines.push(`${sigIndent}strategy: ${formatString(config.componentJoin.strategy, q)},`);
  lines.push(`${sigIndent}separator: ${formatString(config.componentJoin.separator, q)}`);
  lines.push(`${algorithmIndent}},`);

  // Validation options (optional)
  if (config.validation) {
    lines.push(`${algorithmIndent}validation: {`);
    if (config.validation.headerCaseSensitive !== undefined) {
      lines.push(`${sigIndent}headerCaseSensitive: ${config.validation.headerCaseSensitive},`);
    }
    if (config.validation.allowEmptyBody !== undefined) {
      lines.push(`${sigIndent}allowEmptyBody: ${config.validation.allowEmptyBody},`);
    }
    if (config.validation.normalizeUnicode !== undefined) {
      lines.push(`${sigIndent}normalizeUnicode: ${config.validation.normalizeUnicode},`);
    }
    // Remove trailing comma from last validation field
    if (lines[lines.length - 1].endsWith(',')) {
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
    }
    lines.push(`${algorithmIndent}},`);
  }

  // Remove trailing comma from last field
  if (lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }

  lines.push(`${indent}},`);

  return lines.join('\n');
}

/**
 * Generate Trigger Definition using Trigger class
 */
export function generateTriggerDefinition(
  triggerId: string,
  triggerData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string {
  // Validate required parameters
  if (!triggerId || typeof triggerId !== 'string') {
    throw new Error('triggerId is required and must be a string');
  }

  if (!triggerData || typeof triggerData !== 'object') {
    throw new Error(`triggerData is required for trigger '${triggerId}'`);
  }

  // Validate required trigger fields
  const requiredFields = ['name', 'messageTemplate'];
  const missingFields = requiredFields.filter(
    (field) =>
      !triggerData[field] || triggerData[field] === null || triggerData[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for trigger '${triggerId}': ${missingFields.join(', ')}`
    );
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  const triggerVarName = toCamelCase(triggerId);
  const lines: string[] = [];

  lines.push(`export const ${triggerVarName} = new Trigger({`);

  // ID
  lines.push(`${indentation}id: ${formatString(triggerId, q)},`);

  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(triggerData.name, q)},`);

  // Description (optional)
  if (triggerData.description) {
    lines.push(`${indentation}description: ${formatString(triggerData.description, q, true)},`);
  }

  // Enabled (optional, defaults to true)
  if (triggerData.enabled !== undefined && triggerData.enabled !== null) {
    lines.push(`${indentation}enabled: ${triggerData.enabled},`);
  }

  // Message template (required)
  lines.push(
    `${indentation}messageTemplate: ${formatString(triggerData.messageTemplate, q, true)},`
  );

  // Input schema (optional)
  if (triggerData.inputSchema) {
    const schemaStr = JSON.stringify(triggerData.inputSchema, null, 2);
    const formattedSchema = schemaStr
      .split('\n')
      .map((line, index) => {
        if (index === 0) return `${indentation}inputSchema: ${line}`;
        return `${indentation}${line}`;
      })
      .join('\n');
    lines.push(`${formattedSchema},`);
  }

  // Output transform (optional)
  if (triggerData.outputTransform) {
    const outputTransformFormatted = formatOutputTransform(triggerData.outputTransform, style, 1);
    if (outputTransformFormatted) {
      lines.push(outputTransformFormatted);
    }
  }

  // Authentication (optional)
  if (triggerData.authentication) {
    const authFormatted = formatAuthentication(triggerData.authentication, style, 1);
    if (authFormatted) {
      lines.push(authFormatted);
    }
  }

  // Signature verification (optional)
  if (triggerData.signatureVerification) {
    const sigVerificationFormatted = formatSignatureVerification(
      triggerData.signatureVerification,
      style,
      1
    );
    if (sigVerificationFormatted) {
      lines.push(sigVerificationFormatted);
    }
  }

  // Signing secret credential reference (optional)
  if (triggerData.signingSecretCredentialReferenceId) {
    if (!registry) {
      throw new Error('Registry is required for signingSecretCredentialReferenceId generation');
    }

    // Reference to a credential variable - use registry
    const credentialVar = registry.getVariableName(
      triggerData.signingSecretCredentialReferenceId,
      'credentials'
    );

    if (!credentialVar) {
      throw new Error(
        `Failed to resolve variable name for credential reference: ${triggerData.signingSecretCredentialReferenceId}`
      );
    }

    lines.push(`${indentation}signingSecretCredentialReference: ${credentialVar},`);
  }

  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }

  lines.push(`})${semi}`);

  return lines.join('\n');
}

/**
 * Generate imports needed for a trigger file
 */
export function generateTriggerImports(
  triggerId: string,
  triggerData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string[] {
  const imports: string[] = [];

  // Always import Trigger from SDK
  imports.push(generateImport(['Trigger'], '@inkeep/agents-sdk', style));

  // Generate imports for referenced credentials if registry is available
  if (
    triggerData.signingSecretCredentialReferenceId &&
    typeof triggerData.signingSecretCredentialReferenceId === 'string'
  ) {
    if (!registry) {
      throw new Error('Registry is required for credential reference imports');
    }

    const currentFilePath = `agents/triggers/${triggerId}.ts`;
    const credentialRefs = [
      { id: triggerData.signingSecretCredentialReferenceId, type: 'credentials' as const },
    ];

    // Get import statements for referenced credentials
    const componentImports = registry.getImportsForFile(currentFilePath, credentialRefs);
    imports.push(...componentImports);
  }

  return imports;
}

/**
 * Generate complete trigger file (imports + definition)
 */
export function generateTriggerFile(
  triggerId: string,
  triggerData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string {
  const imports = generateTriggerImports(triggerId, triggerData, style, registry);
  const definition = generateTriggerDefinition(triggerId, triggerData, style, registry);

  return generateFileContent(imports, [definition]);
}
