import {
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';
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

  const parsed = result.data;
  const sourceFile = project.createSourceFile('context-config-definition.ts', '', {
    overwrite: true,
  });

  if (isHeadersDefinitionData(parsed)) {
    return generateStandaloneHeadersDefinition(sourceFile, parsed);
  }

  if (isFetchDefinitionData(parsed)) {
    return generateStandaloneFetchDefinition(sourceFile, parsed);
  }

  const headersReference = resolveHeadersReference(parsed);
  // @ts-expect-error -- fixme
  const fetchDefinitions = collectFetchDefinitionEntries(parsed.contextVariables);
  const credentialReferenceNames = collectCredentialReferenceNames(
    fetchDefinitions,
    // @ts-expect-error -- fixme
    parsed.referenceOverrides?.credentialReferences
  );
  const coreImports = ['contextConfig'];
  // @ts-expect-error -- fixme
  if (headersReference && isPlainObject(parsed.headersSchema)) {
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
  // @ts-expect-error -- fixme
  if (isPlainObject(parsed.headersSchema) || hasResponseSchemas) {
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
  // @ts-expect-error -- fixme
  if (headersReference && isPlainObject(parsed.headersSchema)) {
    const { configObject: headersObject } = addFactoryConfigVariable({
      sourceFile,
      importName: 'headers',
      variableName: headersReference,
    });

    headersObject.addPropertyAssignment({
      name: 'schema',
      // @ts-expect-error -- fixme
      initializer: convertJsonSchemaToZod(parsed.headersSchema),
    });
  }

  for (const fetchDefinition of fetchDefinitions) {
    const { configObject: fetchConfigObject } = addFactoryConfigVariable({
      sourceFile,
      importName: 'fetchDefinition',
      variableName: fetchDefinition.variableName,
    });
    // @ts-expect-error -- fixme
    writeFetchDefinition(fetchConfigObject, fetchDefinition.data, credentialReferenceNames);
  }
  // @ts-expect-error -- fixme
  const contextConfigVarName = toContextConfigVariableName(parsed.contextConfigId);
  const { configObject } = addFactoryConfigVariable({
    sourceFile,
    importName: 'contextConfig',
    variableName: contextConfigVarName,
    isExported: true,
  });

  writeContextConfig(configObject, parsed, headersReference);

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

function resolveHeadersReference(data: ParsedContextConfigDefinitionData): string | undefined {
  const headersRef = extractHeadersReference(data.headers);
  if (headersRef) {
    return toReferenceIdentifier(headersRef);
  }

  if (isPlainObject(data.headersSchema)) {
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
  { contextConfigId, responseSchema, credentialReferenceId, ...rest }: Record<string, unknown>,
  credentialReferenceNames?: Map<string, string>
) {
  for (const [k, v] of Object.entries({
    id: contextConfigId,
    ...rest,
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
