import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addFactoryConfigVariable,
  addStringProperty,
  addValueToObject,
  convertJsonSchemaToZodSafe,
  convertNullToUndefined,
  createInMemoryProject,
  formatPropertyName,
  isPlainObject,
  toCamelCase,
} from './utils';

interface ContextConfigDefinitionData {
  contextConfigId: string;
  id?: string;
  schema?: Record<string, unknown>;
  headers?: string | { id?: string; name?: string };
  headersSchema?: Record<string, unknown>;
  contextVariables?: Record<string, unknown>;
  referenceOverrides?: {
    credentialReferences?: Record<string, string>;
  };
}

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  credentialReferences: ReferenceNameByIdSchema.optional(),
});

const ContextConfigSchema = z.looseObject({
  contextConfigId: z.string().nonempty(),
  id: z.string().optional(),
  schema: z.looseObject({}).optional(),
  headers: z.union([z.string(), z.looseObject({ id: z.string().optional() })]).optional(),
  headersSchema: z.preprocess(convertNullToUndefined, z.looseObject({}).optional()),
  contextVariables: z.record(z.string(), z.unknown()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
});

type ParsedContextConfigDefinitionData = z.infer<typeof ContextConfigSchema>;

export function generateContextConfigDefinition(data: ContextConfigDefinitionData): SourceFile {
  const result = ContextConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for context config:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data as ParsedContextConfigDefinitionData;
  const sourceFile = project.createSourceFile('context-config-definition.ts', '', {
    overwrite: true,
  });

  if (isHeadersDefinitionData(parsed)) {
    return generateStandaloneHeadersDefinition(sourceFile, parsed);
  }

  if (isFetchDefinitionData(parsed)) {
    return generateStandaloneFetchDefinition(sourceFile, parsed);
  }

  const parsedContextConfig = result.data as ParsedContextConfigDefinitionData;
  const explicitHeadersReference = extractHeadersReference(parsedContextConfig.headers);
  const templateHeaderVariables = collectTemplateHeaderVariables(
    parsedContextConfig.contextVariables
  );
  const inferredHeadersSchema =
    !isPlainObject(parsedContextConfig.headersSchema) && !explicitHeadersReference
      ? inferHeadersSchemaFromTemplateHeaderVariables(templateHeaderVariables)
      : undefined;
  const headersSchema = isPlainObject(parsedContextConfig.headersSchema)
    ? parsedContextConfig.headersSchema
    : inferredHeadersSchema;
  const headersReference = resolveHeadersReference(parsedContextConfig, Boolean(headersSchema));
  const shouldDefineHeadersInFile = Boolean(headersReference) && isPlainObject(headersSchema);
  const fetchDefinitions = collectFetchDefinitionEntries(parsedContextConfig.contextVariables);
  const credentialReferenceNames = collectCredentialReferenceNames(
    fetchDefinitions,
    parsedContextConfig.referenceOverrides?.credentialReferences
  );
  const coreImports = ['contextConfig'];
  if (shouldDefineHeadersInFile) {
    coreImports.unshift('headers');
  }
  if (fetchDefinitions.length > 0) {
    coreImports.splice(coreImports.length - 1, 0, 'fetchDefinition');
  }

  sourceFile.addImportDeclaration({
    namedImports: coreImports,
    moduleSpecifier: '@inkeep/agents-core',
  });

  const hasResponseSchemas = fetchDefinitions.some((definition) =>
    // @ts-expect-error -- fixme
    isPlainObject(definition.data.responseSchema)
  );
  if (shouldDefineHeadersInFile || hasResponseSchemas) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  for (const [credentialId, credentialReferenceName] of credentialReferenceNames) {
    sourceFile.addImportDeclaration({
      namedImports: [credentialReferenceName],
      moduleSpecifier: `../credentials/${credentialId}`,
    });
  }
  if (shouldDefineHeadersInFile && headersReference && headersSchema) {
    const { configObject: headersObject } = addFactoryConfigVariable({
      sourceFile,
      importName: 'headers',
      variableName: headersReference,
    });

    headersObject.addPropertyAssignment({
      name: 'schema',
      initializer: convertJsonSchemaToZod(headersSchema),
    });
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
  const contextConfigVarName = toContextConfigVariableName(parsedContextConfig.contextConfigId);
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName: 'contextConfig',
    variableName: contextConfigVarName,
    isExported: true,
  });

  writeContextConfig(configObject, parsedContextConfig, headersReference);

  return sourceFile;
}

function writeContextConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedContextConfigDefinitionData,
  headersReference?: string
) {
  if (data.id !== undefined) {
    addStringProperty(configObject, 'id', data.id);
  }

  if (headersReference) {
    configObject.addPropertyAssignment({
      name: 'headers',
      initializer: headersReference,
    });
  }

  if (data.contextVariables && Object.keys(data.contextVariables).length > 0) {
    const contextVariablesProperty = configObject.addPropertyAssignment({
      name: 'contextVariables',
      initializer: '{}',
    });
    const contextVariablesObject = contextVariablesProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );

    for (const [key, value] of Object.entries(data.contextVariables)) {
      const reference = extractContextVariableReference(key, value);
      if (!reference) {
        continue;
      }

      contextVariablesObject.addPropertyAssignment({
        name: formatPropertyName(key),
        initializer: reference,
      });
    }
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
  data: ParsedContextConfigDefinitionData,
  hasHeadersSchema: boolean
): string | undefined {
  const headersRef = extractHeadersReference(data.headers);
  if (headersRef) {
    return toReferenceIdentifier(headersRef);
  }

  if (hasHeadersSchema) {
    return `${toContextConfigVariableName(data.contextConfigId)}Headers`;
  }

  return undefined;
}

function isFetchDefinitionData(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    return false;
  }

  return value.fetchConfig !== undefined || value.responseSchema !== undefined;
}

function collectFetchDefinitionEntries(contextVariables?: Record<string, unknown>) {
  if (!contextVariables) {
    return [];
  }

  return Object.entries(contextVariables)
    .filter(([, value]) => isFetchDefinitionData(value))
    .map(([key, value]) => {
      const variableName =
        extractContextVariableReference(key, value) ?? toReferenceIdentifier(key);
      return {
        key,
        variableName,
        data: value,
      };
    });
}

function writeFetchDefinition(
  configObject: ObjectLiteralExpression,
  fetchDefinitionData: unknown,
  credentialReferenceNames?: Map<string, string>,
  headersReference?: string
) {
  const { contextConfigId, responseSchema, credentialReferenceId, ...rest } = isPlainObject(
    fetchDefinitionData
  )
    ? fetchDefinitionData
    : {};
  const normalizedRest = rewriteHeaderTemplates(rest, headersReference);
  for (const [k, v] of Object.entries({
    id: contextConfigId,
    ...normalizedRest,
  })) {
    if (v !== null) {
      addValueToObject(configObject, k, v);
    }
  }
  if (responseSchema) {
    configObject.addPropertyAssignment({
      name: 'responseSchema',
      // @ts-expect-error -- fixme
      initializer: convertJsonSchemaToZod(responseSchema),
    });
  }

  if (
    typeof credentialReferenceId === 'string' &&
    credentialReferenceNames?.has(credentialReferenceId)
  ) {
    configObject.addPropertyAssignment({
      name: 'credentialReference',
      initializer: credentialReferenceNames.get(credentialReferenceId) as string,
    });
    return;
  }

  if (typeof credentialReferenceId === 'string') {
    addStringProperty(configObject, 'credentialReferenceId', credentialReferenceId);
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
  data: ParsedContextConfigDefinitionData
): SourceFile {
  const importName = 'headers';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-core',
  });
  sourceFile.addImportDeclaration({
    namedImports: ['z'],
    moduleSpecifier: 'zod',
  });

  const headersVarName = toContextConfigVariableName(data.contextConfigId);
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName,
    variableName: headersVarName,
  });

  configObject.addPropertyAssignment({
    name: 'schema',
    // @ts-expect-error -- fixme
    initializer: convertJsonSchemaToZod(data.schema),
  });
  return sourceFile;
}

function isHeadersDefinitionData(
  value: ParsedContextConfigDefinitionData
): value is ParsedContextConfigDefinitionData & { schema: Record<string, unknown> } {
  return isPlainObject(value.schema);
}

function generateStandaloneFetchDefinition(
  sourceFile: SourceFile,
  data: ParsedContextConfigDefinitionData
): SourceFile {
  const importName = 'fetchDefinition';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-core',
  });

  if (isPlainObject(data.responseSchema)) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const credentialReferenceNames = new Map<string, string>();
  if (typeof (data as Record<string, unknown>).credentialReferenceId === 'string') {
    const credentialReferenceId = (data as Record<string, unknown>).credentialReferenceId as string;
    const credentialReferenceName =
      data.referenceOverrides?.credentialReferences?.[credentialReferenceId] ??
      toReferenceIdentifier(credentialReferenceId);
    credentialReferenceNames.set(credentialReferenceId, credentialReferenceName);
    sourceFile.addImportDeclaration({
      namedImports: [credentialReferenceName],
      moduleSpecifier: `../credentials/${credentialReferenceId}`,
    });
  }

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

function collectTemplateHeaderVariables(contextVariables?: Record<string, unknown>): Set<string> {
  const variables = new Set<string>();
  collectTemplateHeaderVariablesFromValue(contextVariables, variables);
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
