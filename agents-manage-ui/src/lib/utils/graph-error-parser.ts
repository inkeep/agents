/**
 * Graph Error Parser Utilities
 *
 * Transforms Zod validation errors from graph save operations into user-friendly
 * error messages with node/edge mapping for visual feedback.
 */

export interface ValidationErrorDetail {
  code: string;
  message: string;
  path: string[];
  expected?: string;
}

export interface ProcessedGraphError {
  type: 'node' | 'edge' | 'graph';
  nodeId?: string;
  edgeId?: string;
  field: string;
  message: string;
  fullPath: string[];
  originalError: ValidationErrorDetail;
}

export interface GraphErrorSummary {
  totalErrors: number;
  nodeErrors: Record<string, ProcessedGraphError[]>;
  edgeErrors: Record<string, ProcessedGraphError[]>;
  graphErrors: ProcessedGraphError[];
  allErrors: ProcessedGraphError[];
}

/**
 * Parse Zod validation errors from the API response into structured format
 */
export function parseGraphValidationErrors(apiError: string): GraphErrorSummary {
  try {
    const errors = JSON.parse(apiError) as any[];
    const processedErrors: ProcessedGraphError[] = [];

    for (const error of errors) {
      if (error.code === 'invalid_union' && error.errors && error.path) {
        // Handle union type errors (like agent types with multiple validation paths)
        for (const unionErrorGroup of error.errors) {
          for (const unionError of unionErrorGroup) {
            const processedError = processValidationError(unionError, error.path);
            if (processedError) {
              processedErrors.push(processedError);
            }
          }
        }
      } else if (error.path) {
        // Handle direct validation errors
        const processedError = processValidationError(error, error.path);
        if (processedError) {
          processedErrors.push(processedError);
        }
      }
    }

    return categorizeErrors(processedErrors);
  } catch {
    // Fallback for unparseable errors
    return {
      totalErrors: 1,
      nodeErrors: {},
      edgeErrors: {},
      graphErrors: [
        {
          type: 'graph',
          field: 'unknown',
          message: 'An unknown validation error occurred',
          fullPath: [],
          originalError: {
            code: 'unknown',
            message: apiError,
            path: [],
          },
        },
      ],
      allErrors: [],
    };
  }
}

/**
 * Process a single validation error into our structured format
 */
function processValidationError(
  error: ValidationErrorDetail,
  basePath: string[]
): ProcessedGraphError | null {
  const fullPath = [...basePath, ...error.path];

  // Determine error type and extract IDs
  let type: 'node' | 'edge' | 'graph' = 'graph';
  let nodeId: string | undefined;
  let edgeId: string | undefined;
  let field: string;

  if (fullPath[0] === 'agents' && fullPath[1]) {
    type = 'node';
    nodeId = fullPath[1];
    field = error.path.slice(2).join('.') || 'configuration';
  } else if (fullPath[0] === 'edges' && fullPath[1]) {
    type = 'edge';
    edgeId = fullPath[1];
    field = error.path.join('.') || 'configuration';
  } else {
    field = error.path.join('.') || 'configuration';
  }

  // Create user-friendly message
  const message = createUserFriendlyMessage(error, field, type);

  return {
    type,
    nodeId,
    edgeId,
    field,
    message,
    fullPath,
    originalError: error,
  };
}

/**
 * Create user-friendly error messages
 */
function createUserFriendlyMessage(
  error: ValidationErrorDetail,
  field: string,
  type: 'node' | 'edge' | 'graph'
): string {
  const entityType = type === 'node' ? 'Agent' : type === 'edge' ? 'Connection' : 'Graph';
  const fieldName = getFieldDisplayName(field);

  switch (error.code) {
    case 'invalid_type':
      if (error.expected === 'string' && error.message.includes('undefined')) {
        return `${entityType} is missing required field: ${fieldName}`;
      }
      return `${entityType} ${fieldName} has invalid type. Expected ${error.expected}`;

    case 'too_small':
      return `${entityType} ${fieldName} is too short. Please provide a valid value`;

    case 'invalid_enum_value':
      return `${entityType} ${fieldName} has an invalid value. Please select a valid option`;

    case 'invalid_union':
      // Check if this is an agent type discrimination error
      if (field.includes('type') || error.message.includes('discriminator')) {
        return `${entityType} type must be specified as either 'internal' or 'external'`;
      }
      return `${entityType} configuration is incomplete. Please check all required fields`;

    default:
      return `${entityType} ${fieldName}: ${error.message}`;
  }
}

/**
 * Convert technical field names to user-friendly display names
 */
function getFieldDisplayName(field: string): string {
  const fieldMap: Record<string, string> = {
    instructions: 'Instructions',
    projectId: 'Project ID',
    baseUrl: 'Host URL',
    name: 'Name',
    description: 'Description',
    model: 'Model',
    temperature: 'Temperature',
    maxTokens: 'Max Tokens',
    systemPrompt: 'System Prompt',
    tools: 'Tools',
    dataComponents: 'Components',
    artifactComponents: 'Artifacts',
    relationships: 'Relationships',
    transferTargetToSource: 'Transfer (Target to Source)',
    transferSourceToTarget: 'Transfer (Source to Target)',
    delegateTargetToSource: 'Delegate (Target to Source)',
    delegateSourceToTarget: 'Delegate (Source to Target)',
    contextConfig: 'Context Configuration',
    contextVariables: 'Context Variables',
    requestContextSchema: 'Request Context Schema',
  };

  return (
    fieldMap[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
  );
}

/**
 * Categorize processed errors by type and entity ID
 */
function categorizeErrors(errors: ProcessedGraphError[]): GraphErrorSummary {
  const nodeErrors: Record<string, ProcessedGraphError[]> = {};
  const edgeErrors: Record<string, ProcessedGraphError[]> = {};
  const graphErrors: ProcessedGraphError[] = [];

  for (const error of errors) {
    switch (error.type) {
      case 'node':
        if (error.nodeId) {
          if (!nodeErrors[error.nodeId]) {
            nodeErrors[error.nodeId] = [];
          }
          nodeErrors[error.nodeId].push(error);
        }
        break;
      case 'edge':
        if (error.edgeId) {
          if (!edgeErrors[error.edgeId]) {
            edgeErrors[error.edgeId] = [];
          }
          edgeErrors[error.edgeId].push(error);
        }
        break;
      case 'graph':
        graphErrors.push(error);
        break;
    }
  }

  return {
    totalErrors: errors.length,
    nodeErrors,
    edgeErrors,
    graphErrors,
    allErrors: errors,
  };
}

/**
 * Generate a concise summary message for the error toast
 */
export function getErrorSummaryMessage(errorSummary: GraphErrorSummary): string {
  const { totalErrors, nodeErrors, edgeErrors, graphErrors } = errorSummary;

  if (totalErrors === 0) return '';

  const parts: string[] = [];

  const nodeErrorCount = Object.keys(nodeErrors).length;
  const edgeErrorCount = Object.keys(edgeErrors).length;
  const graphErrorCount = graphErrors.length;

  if (nodeErrorCount > 0) {
    parts.push(`${nodeErrorCount} agent${nodeErrorCount > 1 ? 's' : ''}`);
  }
  if (edgeErrorCount > 0) {
    parts.push(`${edgeErrorCount} connection${edgeErrorCount > 1 ? 's' : ''}`);
  }
  if (graphErrorCount > 0) {
    parts.push(`${graphErrorCount} graph setting${graphErrorCount > 1 ? 's' : ''}`);
  }

  const summary = parts.join(', ');
  return `Validation failed for ${summary}. Check the highlighted items for details.`;
}
