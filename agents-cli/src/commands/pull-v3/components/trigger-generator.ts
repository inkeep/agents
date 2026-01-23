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
 * Generate Trigger Definition using Trigger class
 */
export function generateTriggerDefinition(
  triggerId: string,
  triggerData: any,
  style: CodeStyle = DEFAULT_STYLE
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

  // Signing secret (optional) - not included in generated code for security reasons
  // signingSecret should be set via environment variables

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
export function generateTriggerImports(style: CodeStyle = DEFAULT_STYLE): string[] {
  const imports: string[] = [];

  // Always import Trigger from SDK
  imports.push(generateImport(['Trigger'], '@inkeep/agents-sdk', style));

  return imports;
}

/**
 * Generate complete trigger file (imports + definition)
 */
export function generateTriggerFile(
  triggerId: string,
  triggerData: any,
  style: CodeStyle = DEFAULT_STYLE
): string {
  const imports = generateTriggerImports(style);
  const definition = generateTriggerDefinition(triggerId, triggerData, style);

  return generateFileContent(imports, [definition]);
}
