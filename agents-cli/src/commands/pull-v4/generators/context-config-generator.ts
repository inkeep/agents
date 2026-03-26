import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  applyPromptHeaderTemplateSchema,
  asRecord,
  collectHeaderTemplateVariablesFromAgentPrompts,
} from '../collector-common';
import {
  collectContextConfigCredentialReferenceOverrides,
  collectContextConfigCredentialReferencePathOverrides,
  collectContextConfigHeadersReferenceOverride,
} from '../collector-reference-helpers';
import type { GenerationTask } from '../generation-types';
import { addNamedImports, applyImportPlan, createImportPlan } from '../import-plan';
import { generateValidatedSourceFile } from '../simple-factory-generator';
import {
  addFactoryConfigVariable,
  addValueToObject,
  codeExpression,
  codeReference,
  convertJsonSchemaToZodSafe,
  createInMemoryProject,
  isPlainObject,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.agents.valueType.shape.contextConfig.unwrap();

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

const ReferencePathOverridesSchema = z.object({
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

interface NormalizedContextVariableEntry {
  referenceName: string;
  rawValue: unknown;
  fetchDefinitionData?: Record<string, unknown>;
}

type NormalizedContextVariableMap = Record<string, NormalizedContextVariableEntry>;

const BaseContextConfigSchema = z.strictObject({
  contextConfigId: z.string().nonempty(),
  ...MySchema.shape,
  referenceOverrides: ReferenceOverridesSchema.optional(),
  referencePathOverrides: ReferencePathOverridesSchema.optional(),

  // TODO check these fields
  headers: z.string().optional(),
  headersReference: z.string().optional(),
  schema: z.unknown(),
  name: z.string().nullish(),
  trigger: z.unknown(),
  fetchConfig: z.record(z.string(), z.unknown()).optional(),
  defaultValue: z.unknown(),
  responseSchema: z.unknown(),
});

const ContextConfigSchema = BaseContextConfigSchema.transform((data) => ({
  ...data,
  normalizedHeadersReference: extractHeadersReference(data.headers),
  normalizedContextVariables: normalizeContextVariables(data.contextVariables),
}));

type ContextConfigInput = z.input<typeof ContextConfigSchema>;
type ContextConfigOutput = z.output<typeof ContextConfigSchema>;

function normalizeContextVariables(
  contextVariables?: Record<string, unknown>
): NormalizedContextVariableMap {
  if (!contextVariables) {
    return {};
  }

  const normalizedVariables: NormalizedContextVariableMap = {};
  for (const [key, value] of Object.entries(contextVariables)) {
    const referenceName = extractContextVariableReference(key, value);
    if (!referenceName) {
      continue;
    }

    normalizedVariables[key] = {
      referenceName,
      rawValue: value,
      ...(isPlainObject(value) && isFetchDefinitionData(value)
        ? { fetchDefinitionData: value }
        : {}),
    };
  }

  return normalizedVariables;
}

export function generateContextConfigDefinition(data: ContextConfigInput): SourceFile {
  return generateValidatedSourceFile(data, {
    schema: ContextConfigSchema,
    importName: 'contextConfig',
    render(parsed) {
      const project = createInMemoryProject();
      const sourceFile = project.createSourceFile('context-config-definition.ts', '', {
        overwrite: true,
      });

      if (isHeadersDefinitionData(parsed)) {
        return generateStandaloneHeadersDefinition(sourceFile, parsed);
      }

      if (isFetchDefinitionData(parsed)) {
        return generateStandaloneFetchDefinition(sourceFile, parsed);
      }

      const explicitHeadersReference =
        (typeof parsed.headersReference === 'string' && parsed.headersReference.length > 0
          ? parsed.headersReference
          : undefined) ?? parsed.normalizedHeadersReference;
      const templateHeaderVariables = collectTemplateHeaderVariables(
        parsed.normalizedContextVariables
      );
      const inferredHeadersSchema =
        !isPlainObject(parsed.headersSchema) && !explicitHeadersReference
          ? inferHeadersSchemaFromTemplateHeaderVariables(templateHeaderVariables)
          : undefined;
      const headersSchema = isPlainObject(parsed.headersSchema)
        ? parsed.headersSchema
        : inferredHeadersSchema;
      const headersReference = resolveHeadersReference(parsed, Boolean(headersSchema));
      const shouldDefineHeadersInFile = Boolean(headersReference) && isPlainObject(headersSchema);
      const fetchDefinitions = collectFetchDefinitionEntries(parsed.normalizedContextVariables);
      const credentialReferenceNames = collectCredentialReferenceNames(
        fetchDefinitions,
        parsed.referenceOverrides?.credentialReferences
      );
      const coreImports = ['contextConfig'];
      if (shouldDefineHeadersInFile) {
        coreImports.unshift('headers');
      }
      if (fetchDefinitions.length > 0) {
        coreImports.splice(coreImports.length - 1, 0, 'fetchDefinition');
      }

      const importPlan = createImportPlan();
      addNamedImports(importPlan, '@inkeep/agents-core', coreImports);

      const hasResponseSchemas = fetchDefinitions.some((definition) =>
        isPlainObject(definition.data.responseSchema)
      );
      if (shouldDefineHeadersInFile || hasResponseSchemas) {
        addNamedImports(importPlan, 'zod', 'z');
      }

      for (const [credentialId, credentialReferenceName] of credentialReferenceNames) {
        const credentialReferencePath =
          parsed.referencePathOverrides?.credentialReferences?.[credentialId] ?? credentialId;
        addNamedImports(
          importPlan,
          `../credentials/${credentialReferencePath}`,
          credentialReferenceName
        );
      }
      applyImportPlan(sourceFile, importPlan);
      if (shouldDefineHeadersInFile && headersReference && headersSchema) {
        const { configObject: headersObject } = addFactoryConfigVariable({
          sourceFile,
          isExported: true,
          importName: 'headers',
          variableName: headersReference,
        });

        addValueToObject(headersObject, 'schema', createSchemaExpression(headersSchema));
      }

      for (const fetchDefinition of fetchDefinitions) {
        const { configObject: fetchConfigObject } = addFactoryConfigVariable({
          sourceFile,
          importName: 'fetchDefinition',
          variableName: fetchDefinition.variableName,
        });
        writeFetchDefinition(
          fetchConfigObject,
          fetchDefinition.data,
          credentialReferenceNames,
          headersReference
        );
      }
      const contextConfigVarName = toContextConfigVariableName(parsed.contextConfigId);
      const { configObject } = addFactoryConfigVariable({
        sourceFile,
        importName: 'contextConfig',
        variableName: contextConfigVarName,
        isExported: true,
      });

      writeContextConfig(configObject, parsed, headersReference);

      return sourceFile;
    },
  });
}

function writeContextConfig(
  configObject: ObjectLiteralExpression,
  data: ContextConfigOutput,
  headersReference?: string
) {
  const contextConfig: Record<string, unknown> = {};
  if (data.id !== undefined) {
    contextConfig.id = data.id;
  }
  if (headersReference) {
    contextConfig.headers = codeReference(headersReference);
  }
  if (Object.keys(data.normalizedContextVariables).length > 0) {
    const contextVariables: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data.normalizedContextVariables)) {
      contextVariables[key] = codeReference(value.referenceName);
    }
    contextConfig.contextVariables = contextVariables;
  }

  for (const [key, value] of Object.entries(contextConfig)) {
    addValueToObject(configObject, key, value);
  }
}

function extractHeadersReference(headers?: string | { id?: string; name?: string }) {
  if (!headers) {
    return undefined;
  }
  if (typeof headers === 'string') {
    return headers;
  }
  if (typeof headers.id === 'string') {
    return headers.id;
  }
  if (typeof headers.name === 'string') {
    return headers.name;
  }
  return undefined;
}

function resolveHeadersReference(
  data: ContextConfigOutput,
  hasHeadersSchema: boolean
): string | undefined {
  if (typeof data.headersReference === 'string' && data.headersReference) {
    return data.headersReference;
  }

  const headersRef = extractHeadersReference(data.headers);
  if (headersRef) {
    return toReferenceIdentifier(headersRef);
  }

  if (hasHeadersSchema) {
    return `${toContextConfigVariableName(data.contextConfigId)}Headers`;
  }

  return undefined;
}

function isFetchDefinitionData(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  return value.fetchConfig !== undefined || value.responseSchema !== undefined;
}

function collectFetchDefinitionEntries(
  contextVariables?: NormalizedContextVariableMap
): Array<{ key: string; variableName: string; data: Record<string, unknown> }> {
  if (!contextVariables || Object.keys(contextVariables).length === 0) {
    return [];
  }

  return Object.entries(contextVariables)
    .filter(([, value]) => Boolean(value.fetchDefinitionData))
    .map(([key, value]) => ({
      key,
      variableName: value.referenceName,
      data: value.fetchDefinitionData as Record<string, unknown>,
    }));
}

function writeFetchDefinition(
  configObject: ObjectLiteralExpression,
  fetchDefinitionData: unknown,
  credentialReferenceNames?: Map<string, string>,
  headersReference?: string
) {
  const {
    contextConfigId,
    responseSchema,
    credentialReferenceId,
    normalizedHeadersReference: _normalizedHeadersReference,
    normalizedContextVariables: _normalizedContextVariables,
    ...rest
  } = isPlainObject(fetchDefinitionData) ? fetchDefinitionData : {};
  const normalizedRest = rewriteHeaderTemplates(rest, headersReference);
  const fetchDefinition: Record<string, unknown> = {};
  for (const [k, v] of Object.entries({
    id: contextConfigId,
    ...normalizedRest,
  })) {
    if (v !== null) {
      fetchDefinition[k] = v;
    }
  }
  if (responseSchema) {
    fetchDefinition.responseSchema = createSchemaExpression(
      responseSchema as Record<string, unknown>
    );
  }

  if (
    typeof credentialReferenceId === 'string' &&
    credentialReferenceNames?.has(credentialReferenceId)
  ) {
    fetchDefinition.credentialReference = codeReference(
      credentialReferenceNames.get(credentialReferenceId) as string
    );
  } else if (typeof credentialReferenceId === 'string') {
    fetchDefinition.credentialReferenceId = credentialReferenceId;
  }

  for (const [key, value] of Object.entries(fetchDefinition)) {
    addValueToObject(configObject, key, value);
  }
}

const HEADER_TEMPLATE_REGEX = /\{\{headers\.([^}]+)\}\}/g;
const HEADER_TO_TEMPLATE_CALL_REGEX =
  /\$\{\s*(headersSchema|headers)\.toTemplate\((['"])([^'"`]+)\2\)\s*\}/g;

function rewriteHeaderTemplates<T>(value: T, headersReference?: string): T {
  if (!headersReference) {
    return value;
  }

  if (typeof value === 'string') {
    const withHeaderTokensReplaced = value.replace(
      HEADER_TEMPLATE_REGEX,
      (_, variableName: string) => {
        return `\${${headersReference}.toTemplate(${JSON.stringify(variableName)})}`;
      }
    );
    return withHeaderTokensReplaced.replace(
      HEADER_TO_TEMPLATE_CALL_REGEX,
      (_, __: string, ___: string, variableName: string) => {
        return `\${${headersReference}.toTemplate(${JSON.stringify(variableName)})}`;
      }
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteHeaderTemplates(entry, headersReference)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        rewriteHeaderTemplates(entryValue, headersReference),
      ])
    ) as T;
  }

  return value;
}

function generateStandaloneHeadersDefinition(
  sourceFile: SourceFile,
  data: ContextConfigOutput & { schema: Record<string, unknown> }
): SourceFile {
  const importName = 'headers';
  const importPlan = createImportPlan();
  addNamedImports(importPlan, '@inkeep/agents-core', importName);
  addNamedImports(importPlan, 'zod', 'z');
  applyImportPlan(sourceFile, importPlan);

  const headersVarName = toContextConfigVariableName(data.contextConfigId);
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName,
    variableName: headersVarName,
  });

  addValueToObject(configObject, 'schema', createSchemaExpression(data.schema));
  return sourceFile;
}

function isHeadersDefinitionData(
  value: ContextConfigOutput
): value is ContextConfigOutput & { schema: Record<string, unknown> } {
  return isPlainObject(value.schema);
}

function generateStandaloneFetchDefinition(
  sourceFile: SourceFile,
  data: ContextConfigOutput
): SourceFile {
  const importName = 'fetchDefinition';
  const importPlan = createImportPlan();
  addNamedImports(importPlan, '@inkeep/agents-core', importName);

  if (isPlainObject(data.responseSchema)) {
    addNamedImports(importPlan, 'zod', 'z');
  }

  const credentialReferenceNames = new Map<string, string>();
  if (typeof (data as Record<string, unknown>).credentialReferenceId === 'string') {
    const credentialReferenceId = (data as Record<string, unknown>).credentialReferenceId as string;
    const credentialReferenceName =
      data.referenceOverrides?.credentialReferences?.[credentialReferenceId] ??
      toReferenceIdentifier(credentialReferenceId);
    const credentialReferencePath =
      data.referencePathOverrides?.credentialReferences?.[credentialReferenceId] ??
      credentialReferenceId;
    credentialReferenceNames.set(credentialReferenceId, credentialReferenceName);
    addNamedImports(
      importPlan,
      `../credentials/${credentialReferencePath}`,
      credentialReferenceName
    );
  }
  applyImportPlan(sourceFile, importPlan);

  const fetchVarName = toContextConfigVariableName(data.contextConfigId);
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName,
    variableName: fetchVarName,
  });

  writeFetchDefinition(configObject, data, credentialReferenceNames);
  return sourceFile;
}

function convertJsonSchemaToZod(schema: Record<string, unknown>): string {
  return convertJsonSchemaToZodSafe(schema, {
    conversionOptions: { module: 'none' },
  });
}

function createSchemaExpression(schema: Record<string, unknown>) {
  return codeExpression(convertJsonSchemaToZod(schema));
}

function extractContextVariableReference(key: string, value: unknown): string | undefined {
  if (typeof value === 'string') {
    return toReferenceIdentifier(value);
  }

  if (!isPlainObject(value)) {
    return;
  }

  if (typeof value.id === 'string') {
    return toReferenceIdentifier(value.id);
  }
  if (typeof value.name === 'string') {
    return toReferenceIdentifier(value.name);
  }
  if (typeof value.ref === 'string') {
    return toReferenceIdentifier(value.ref);
  }
  if (typeof value.variable === 'string') {
    return toReferenceIdentifier(value.variable);
  }

  if (value.fetchConfig || value.responseSchema) {
    return toReferenceIdentifier(key);
  }

  return toReferenceIdentifier(key);
}

const toContextConfigVariableName = toCamelCase;

const toReferenceIdentifier = toCamelCase;

function collectCredentialReferenceNames(
  fetchDefinitions: Array<{ data: unknown }>,
  overrideNamesById?: Record<string, string>
): Map<string, string> {
  const credentialReferenceNames = new Map<string, string>();

  for (const fetchDefinition of fetchDefinitions) {
    const fetchDefinitionData = isPlainObject(fetchDefinition.data)
      ? fetchDefinition.data
      : undefined;
    const credentialReferenceId =
      fetchDefinitionData && typeof fetchDefinitionData.credentialReferenceId === 'string'
        ? fetchDefinitionData.credentialReferenceId
        : undefined;
    if (!credentialReferenceId || credentialReferenceNames.has(credentialReferenceId)) {
      continue;
    }

    credentialReferenceNames.set(
      credentialReferenceId,
      overrideNamesById?.[credentialReferenceId] ?? toReferenceIdentifier(credentialReferenceId)
    );
  }

  return credentialReferenceNames;
}

function collectTemplateHeaderVariables(
  contextVariables?: NormalizedContextVariableMap
): Set<string> {
  const variables = new Set<string>();
  for (const value of Object.values(contextVariables ?? {})) {
    collectTemplateHeaderVariablesFromValue(value.rawValue, variables);
  }
  return variables;
}

function collectTemplateHeaderVariablesFromValue(value: unknown, variables: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(HEADER_TEMPLATE_REGEX)) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }
    for (const match of value.matchAll(HEADER_TO_TEMPLATE_CALL_REGEX)) {
      if (match[3]) {
        variables.add(match[3]);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTemplateHeaderVariablesFromValue(entry, variables);
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const entryValue of Object.values(value)) {
      collectTemplateHeaderVariablesFromValue(entryValue, variables);
    }
  }
}

function inferHeadersSchemaFromTemplateHeaderVariables(
  variables: Set<string>
): Record<string, unknown> | undefined {
  if (!variables.size) {
    return;
  }

  const properties: Record<string, unknown> = {};
  for (const variable of [...variables].sort()) {
    properties[variable] = { type: 'string' };
  }

  return {
    type: 'object',
    properties,
    required: [...variables].sort(),
    additionalProperties: false,
  };
}

export const task = {
  type: 'context-config',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const contextConfigRecordsById = new Map<
      string,
      ReturnType<
        GenerationTask<Parameters<typeof generateContextConfigDefinition>[0]>['collect']
      >[number]
    >();

    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      const contextConfig = agentData ? asRecord(agentData.contextConfig) : undefined;
      if (!agentData || !contextConfig) {
        continue;
      }

      const normalizedContextConfig = applyPromptHeaderTemplateSchema(
        contextConfig,
        collectHeaderTemplateVariablesFromAgentPrompts(agentData)
      );
      const contextConfigId =
        typeof normalizedContextConfig.id === 'string' ? normalizedContextConfig.id : '';
      if (!contextConfigId || contextConfigRecordsById.has(contextConfigId)) {
        continue;
      }

      const contextConfigFilePath = context.resolver.resolveOutputFilePath(
        'contextConfigs',
        contextConfigId,
        join(context.paths.contextConfigsDir, `${contextConfigId}.ts`)
      );
      const credentialReferenceOverrides = collectContextConfigCredentialReferenceOverrides(
        context,
        normalizedContextConfig
      );
      const credentialReferencePathOverrides = collectContextConfigCredentialReferencePathOverrides(
        context,
        normalizedContextConfig
      );
      const headersReferenceOverride = collectContextConfigHeadersReferenceOverride(
        context,
        contextConfigId,
        contextConfigFilePath
      );

      contextConfigRecordsById.set(contextConfigId, {
        id: contextConfigId,
        filePath: contextConfigFilePath,
        payload: {
          contextConfigId,
          ...normalizedContextConfig,
          ...(headersReferenceOverride && {
            headersReference: headersReferenceOverride,
          }),
          ...(credentialReferenceOverrides && {
            referenceOverrides: {
              credentialReferences: credentialReferenceOverrides,
            },
          }),
          ...(credentialReferencePathOverrides && {
            referencePathOverrides: {
              credentialReferences: credentialReferencePathOverrides,
            },
          }),
        } as Parameters<typeof generateContextConfigDefinition>[0],
      });
    }

    return [...contextConfigRecordsById.values()];
  },
  generate: generateContextConfigDefinition,
} satisfies GenerationTask<Parameters<typeof generateContextConfigDefinition>[0]>;
