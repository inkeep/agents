/**
 * Agent Error Parser Utilities
 *
 * Transforms Zod validation errors from agent save operations into user-friendly
 * error messages with node/edge mapping for visual feedback.
 */

export interface ValidationErrorDetail {
  code: string;
  message: string;
  path: string[];
  expected?: string;
}

export interface ProcessedAgentError {
  type: 'node' | 'edge' | 'agent';
  nodeType?: 'subAgent' | 'functionTool';
  nodeId?: string;
  edgeId?: string;
  field: string;
  message: string;
  fullPath: string[];
  originalError: ValidationErrorDetail;
}

export interface AgentErrorSummary {
  totalErrors: number;
  subAgentErrors: Record<string, ProcessedAgentError[]>;
  functionToolErrors: Record<string, ProcessedAgentError[]>;
  edgeErrors: Record<string, ProcessedAgentError[]>;
  agentErrors: ProcessedAgentError[];
  allErrors: ProcessedAgentError[];
  // Legacy property for backward compatibility
  nodeErrors: Record<string, ProcessedAgentError[]>;
}

/**
 * Parse Zod validation errors from the API response into structured format
 */
export function parseAgentValidationErrors(apiError: string): AgentErrorSummary {
  try {
    const errors = JSON.parse(apiError) as any[];
    const processedErrors: ProcessedAgentError[] = [];

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
      subAgentErrors: {},
      functionToolErrors: {},
      nodeErrors: {},
      edgeErrors: {},
      agentErrors: [
        {
          type: 'agent',
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
): ProcessedAgentError | null {
  const fullPath = [...basePath, ...error.path];

  // Determine error type and extract IDs
  let type: 'node' | 'edge' | 'agent' = 'agent';
  let nodeType: 'subAgent' | 'functionTool' | undefined;
  let nodeId: string | undefined;
  let edgeId: string | undefined;
  let field: string;

  if ((error as any).functionToolId) {
    type = 'node';
    nodeType = 'functionTool';
    nodeId = (error as any).functionToolId;
    field = (error as any).field || 'configuration';
  } else if (fullPath[0] === 'functionTools' && fullPath[1]) {
    type = 'node';
    nodeType = 'functionTool';
    nodeId = fullPath[1];
    field = error.path.slice(2).join('.') || (error as any).field || 'configuration';
  } else if (fullPath[0] === 'subAgents' && fullPath[1]) {
    type = 'node';
    nodeType = 'subAgent';
    nodeId = fullPath[1];
    field = error.path.join('.') || 'configuration';
  } else if (fullPath[0] === 'edges' && fullPath[1]) {
    type = 'edge';
    edgeId = fullPath[1];
    field = error.path.join('.') || 'configuration';
  } else {
    field = error.path.join('.') || 'configuration';
  }

  // Create user-friendly message
  const message = createUserFriendlyMessage(error, field, type, nodeType);

  return {
    type,
    nodeType,
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
  type: 'node' | 'edge' | 'agent',
  nodeType?: 'subAgent' | 'functionTool'
): string {
  let entityType: string;
  if (type === 'node') {
    entityType = nodeType === 'functionTool' ? 'Function Tool' : 'Sub Agent';
  } else if (type === 'edge') {
    entityType = 'Connection';
  } else {
    entityType = 'Agent';
  }
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
    projectId: 'Project id',
    baseUrl: 'Host URL',
    name: 'Name',
    description: 'Description',
    model: 'Model',
    temperature: 'Temperature',
    maxTokens: 'Max tokens',
    systemPrompt: 'System prompt',
    tools: 'Tools',
    dataComponents: 'Components',
    artifactComponents: 'Artifacts',
    relationships: 'Relationships',
    transferTargetToSource: 'Transfer (target to source)',
    transferSourceToTarget: 'Transfer (source to target)',
    delegateTargetToSource: 'Delegate (target to source)',
    delegateSourceToTarget: 'Delegate (source to target)',
    contextConfig: 'Context configuration',
    contextVariables: 'Context variables',
    headersSchema: 'Headers schema',
  };

  return (
    fieldMap[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
  );
}

/**
 * Categorize processed errors by type and entity ID
 */
function categorizeErrors(errors: ProcessedAgentError[]): AgentErrorSummary {
  const subAgentErrors: Record<string, ProcessedAgentError[]> = {};
  const functionToolErrors: Record<string, ProcessedAgentError[]> = {};
  const nodeErrors: Record<string, ProcessedAgentError[]> = {}; // Legacy support
  const edgeErrors: Record<string, ProcessedAgentError[]> = {};
  const agentErrors: ProcessedAgentError[] = [];

  for (const error of errors) {
    switch (error.type) {
      case 'node':
        if (error.nodeId) {
          // Categorize by node type
          if (error.nodeType === 'functionTool') {
            if (!functionToolErrors[error.nodeId]) {
              functionToolErrors[error.nodeId] = [];
            }
            functionToolErrors[error.nodeId].push(error);
          } else {
            // Default to sub-agent errors for backward compatibility
            if (!subAgentErrors[error.nodeId]) {
              subAgentErrors[error.nodeId] = [];
            }
            subAgentErrors[error.nodeId].push(error);
          }

          // Also add to legacy nodeErrors for backward compatibility
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
      case 'agent':
        agentErrors.push(error);
        break;
    }
  }

  return {
    totalErrors: errors.length,
    subAgentErrors,
    functionToolErrors,
    nodeErrors,
    edgeErrors,
    agentErrors,
    allErrors: errors,
  };
}

/**
 * Generate a concise summary message for the error toast
 */
export function getErrorSummaryMessage(errorSummary: AgentErrorSummary): string {
  const { totalErrors, subAgentErrors, functionToolErrors, edgeErrors, agentErrors } = errorSummary;

  if (totalErrors === 0) return '';

  const parts: string[] = [];

  const subAgentErrorCount = Object.keys(subAgentErrors).length;
  const functionToolErrorCount = Object.keys(functionToolErrors).length;
  const edgeErrorCount = Object.keys(edgeErrors).length;
  const agentErrorCount = agentErrors.length;
  if (subAgentErrorCount > 0) {
    parts.push(`${subAgentErrorCount} sub agent${subAgentErrorCount > 1 ? 's' : ''}`);
  }
  if (functionToolErrorCount > 0) {
    parts.push(`${functionToolErrorCount} function tool${functionToolErrorCount > 1 ? 's' : ''}`);
  }
  if (edgeErrorCount > 0) {
    parts.push(`${edgeErrorCount} connection${edgeErrorCount > 1 ? 's' : ''}`);
  }
  if (agentErrorCount > 0) {
    parts.push(`${agentErrorCount} agent setting${agentErrorCount > 1 ? 's' : ''}`);
  }

  const summary = parts.join(', ');
  return `Validation failed for ${summary}. Check the highlighted items for details.`;
}
