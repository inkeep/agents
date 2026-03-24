import { type CallExpression, Node } from 'ts-morph';
import type { GenerationContext } from './generation-types';
import { collectTemplateVariableNames, isPlainObject, toCamelCase } from './utils';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

export function getObjectKeys(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  return Object.keys(record);
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export function extractReferenceIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        const record = asRecord(item);
        if (record && typeof record.id === 'string') {
          return record.id;
        }
        return undefined;
      })
      .filter((id): id is string => Boolean(id));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.keys(record);
}

export function resolveStatusComponentId(
  statusComponentData: Record<string, unknown>
): string | undefined {
  if (typeof statusComponentData.id === 'string') {
    return statusComponentData.id;
  }
  if (typeof statusComponentData.type === 'string') {
    return statusComponentData.type;
  }
  if (typeof statusComponentData.name === 'string') {
    return statusComponentData.name;
  }
  return undefined;
}

export function collectEnvironmentCredentialReferenceIds(
  project: GenerationContext['project']
): string[] {
  const credentialReferenceIds = new Set<string>();

  for (const toolData of Object.values(project.tools ?? {})) {
    const toolRecord = asRecord(toolData);
    const credentialReferenceId =
      toolRecord && typeof toolRecord.credentialReferenceId === 'string'
        ? toolRecord.credentialReferenceId
        : undefined;
    const hasInlineCredential =
      toolRecord?.credential !== undefined && toolRecord?.credential !== null;

    if (credentialReferenceId && !hasInlineCredential) {
      credentialReferenceIds.add(credentialReferenceId);
    }
  }

  return [...credentialReferenceIds];
}

export function collectReferencedSubAgentComponentIds(
  context: GenerationContext,
  componentProperty: 'dataComponents' | 'artifactComponents'
): string[] {
  const componentIds = new Set<string>();

  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents?.[agentId];
    const subAgents = asRecord(agentData?.subAgents);
    if (!subAgents) {
      continue;
    }

    for (const subAgentData of Object.values(subAgents)) {
      const subAgentRecord = asRecord(subAgentData);
      if (!subAgentRecord) {
        continue;
      }

      for (const componentId of extractReferenceIds(subAgentRecord[componentProperty])) {
        componentIds.add(componentId);
      }
    }
  }

  return [...componentIds];
}

export function extractContextConfigData(
  agentData: Record<string, unknown>
): { id: string; value: Record<string, unknown> } | undefined {
  const contextConfig =
    typeof agentData.contextConfig === 'string'
      ? { id: agentData.contextConfig }
      : asRecord(agentData.contextConfig);
  const contextConfigId =
    contextConfig && typeof contextConfig.id === 'string' ? contextConfig.id : undefined;
  if (!contextConfigId || !contextConfig) {
    return;
  }

  return {
    id: contextConfigId,
    value: contextConfig,
  };
}

export function inferHeadersReferenceFromContextConfig(
  contextConfig: { id: string; value: Record<string, unknown> },
  contextConfigId: string
): string | undefined {
  const headers = contextConfig.value.headers;
  if (typeof headers === 'string' && headers.length > 0) {
    return toCamelCase(headers);
  }

  const headersRecord = asRecord(headers);
  if (headersRecord) {
    if (typeof headersRecord.id === 'string' && headersRecord.id) {
      return toCamelCase(headersRecord.id);
    }
    if (typeof headersRecord.name === 'string' && headersRecord.name) {
      return toCamelCase(headersRecord.name);
    }
  }

  if (isPlainObject(contextConfig.value.headersSchema)) {
    return `${toCamelCase(contextConfigId)}Headers`;
  }

  return;
}

export function collectTemplateVariablesFromValues(values: Array<string | undefined>): string[] {
  const variables: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    variables.push(...collectTemplateVariableNames(value));
  }
  return variables;
}

export function collectHeaderTemplateVariablesFromAgentPrompts(
  agentData: Record<string, unknown>
): Set<string> {
  const variables = new Set<string>();
  addHeaderTemplateVariablesFromString(
    typeof agentData.prompt === 'string' ? agentData.prompt : undefined,
    variables
  );

  const statusUpdates = asRecord(agentData.statusUpdates);
  addHeaderTemplateVariablesFromString(
    typeof statusUpdates?.prompt === 'string' ? statusUpdates.prompt : undefined,
    variables
  );

  const subAgents = asRecord(agentData.subAgents);
  if (!subAgents) {
    return variables;
  }

  for (const subAgentData of Object.values(subAgents)) {
    const subAgent = asRecord(subAgentData);
    addHeaderTemplateVariablesFromString(
      typeof subAgent?.prompt === 'string' ? subAgent.prompt : undefined,
      variables
    );
  }

  return variables;
}

export function applyPromptHeaderTemplateSchema(
  contextConfig: Record<string, unknown>,
  headerTemplateVariables: Set<string>
): Record<string, unknown> {
  if (!headerTemplateVariables.size) {
    return contextConfig;
  }

  const hasExplicitHeadersReference =
    typeof contextConfig.headers === 'string' || isPlainObject(contextConfig.headers);
  if (hasExplicitHeadersReference || isPlainObject(contextConfig.headersSchema)) {
    return contextConfig;
  }

  const variableNames = [...headerTemplateVariables].sort();
  const properties = Object.fromEntries(
    variableNames.map((variableName) => [variableName, { type: 'string' }])
  );

  return {
    ...contextConfig,
    headersSchema: {
      type: 'object',
      properties,
      required: variableNames,
      additionalProperties: false,
    },
  };
}

function addHeaderTemplateVariablesFromString(
  value: string | undefined,
  variables: Set<string>
): void {
  if (typeof value !== 'string') {
    return;
  }

  for (const variableName of collectTemplateVariableNames(value)) {
    if (!variableName.startsWith('headers.')) {
      continue;
    }
    const headerPath = variableName.slice('headers.'.length);
    if (headerPath) {
      variables.add(headerPath);
    }
  }
}

export function isContextConfigInitializer(node: Node): node is CallExpression {
  return (
    Node.isCallExpression(node) &&
    Node.isIdentifier(node.getExpression()) &&
    node.getExpression().getText() === 'contextConfig'
  );
}
