import {
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addStringProperty,
  convertJsonSchemaToZodSafe,
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
}

const ContextConfigSchema = z.looseObject({
  contextConfigId: z.string().nonempty(),
  id: z.string().optional(),
  schema: z.looseObject({}).optional(),
  headers: z.union([z.string(), z.looseObject({ id: z.string().optional() })]).optional(),
  headersSchema: z.looseObject({}).optional(),
  contextVariables: z.record(z.string(), z.unknown()).optional(),
});

type ParsedContextConfigDefinitionData = z.infer<typeof ContextConfigSchema>;

export function generateContextConfigDefinition(data: ContextConfigDefinitionData): string {
  const result = ContextConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Missing required fields for context config:\n${z.prettifyError(result.error)}`
    );
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
  const fetchDefinitions = collectFetchDefinitionEntries(parsed.contextVariables);
  const coreImports = ['contextConfig'];
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
    isPlainObject(definition.data.responseSchema)
  );
  if (isPlainObject(parsed.headersSchema) || hasResponseSchemas) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  if (headersReference && isPlainObject(parsed.headersSchema)) {
    const headersVariableStatement = sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: headersReference,
          initializer: 'headers({})',
        },
      ],
    });

    const [headersDeclaration] = headersVariableStatement.getDeclarations();
    if (!headersDeclaration) {
      throw new Error(`Failed to create headers declaration for '${parsed.contextConfigId}'`);
    }

    const headersCallExpression = headersDeclaration.getInitializerIfKindOrThrow(
      SyntaxKind.CallExpression
    );
    const headersObject = headersCallExpression
      .getArguments()[0]
      ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    headersObject.addPropertyAssignment({
      name: 'schema',
      initializer: convertJsonSchemaToZod(parsed.headersSchema),
    });
  }

  for (const fetchDefinition of fetchDefinitions) {
    const fetchVariableStatement = sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: fetchDefinition.variableName,
          initializer: 'fetchDefinition({})',
        },
      ],
    });

    const [fetchDeclaration] = fetchVariableStatement.getDeclarations();
    if (!fetchDeclaration) {
      throw new Error(
        `Failed to create fetch definition declaration '${fetchDefinition.variableName}'`
      );
    }

    const fetchCallExpression = fetchDeclaration.getInitializerIfKindOrThrow(
      SyntaxKind.CallExpression
    );
    const fetchConfigObject = fetchCallExpression
      .getArguments()[0]
      ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    writeFetchDefinition(fetchConfigObject, fetchDefinition.key, fetchDefinition.data);
  }

  const contextConfigVarName = toContextConfigVariableName(parsed.contextConfigId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: contextConfigVarName,
        initializer: 'contextConfig({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for context config '${parsed.contextConfigId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeContextConfig(configObject, parsed, headersReference);

  return sourceFile.getFullText().trimEnd();
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
  key: string,
  value: Record<string, unknown>
) {
  const id = typeof value.id === 'string' ? value.id : key;
  addStringProperty(configObject, 'id', id);

  if (typeof value.name === 'string') {
    addStringProperty(configObject, 'name', value.name);
  }

  if (typeof value.trigger === 'string') {
    addStringProperty(configObject, 'trigger', value.trigger);
  }

  if (isPlainObject(value.fetchConfig)) {
    const fetchConfigProperty = configObject.addPropertyAssignment({
      name: 'fetchConfig',
      initializer: '{}',
    });
    const fetchConfigObject = fetchConfigProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addObjectEntries(fetchConfigObject, value.fetchConfig);
  }

  if (isPlainObject(value.responseSchema)) {
    configObject.addPropertyAssignment({
      name: 'responseSchema',
      initializer: convertJsonSchemaToZod(value.responseSchema),
    });
  }

  if (value.defaultValue !== undefined && value.defaultValue !== null) {
    if (typeof value.defaultValue === 'string') {
      addStringProperty(configObject, 'defaultValue', value.defaultValue);
    } else {
      configObject.addPropertyAssignment({
        name: 'defaultValue',
        initializer: formatUnknownLiteral(value.defaultValue),
      });
    }
  }

  if (typeof value.credentialReferenceId === 'string') {
    configObject.addPropertyAssignment({
      name: 'credentialReference',
      initializer: toReferenceIdentifier(value.credentialReferenceId),
    });
  }
}

function generateStandaloneHeadersDefinition(
  sourceFile: SourceFile,
  data: ParsedContextConfigDefinitionData
): string {
  sourceFile.addImportDeclaration({
    namedImports: ['headers'],
    moduleSpecifier: '@inkeep/agents-core',
  });
  sourceFile.addImportDeclaration({
    namedImports: ['z'],
    moduleSpecifier: 'zod',
  });

  const headersVarName = toContextConfigVariableName(data.contextConfigId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: headersVarName,
        initializer: 'headers({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create headers declaration '${headersVarName}'`);
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  configObject.addPropertyAssignment({
    name: 'schema',
    initializer: convertJsonSchemaToZod(data.schema),
  });

  return sourceFile.getFullText().trimEnd();
}

function isHeadersDefinitionData(
  value: ParsedContextConfigDefinitionData
): value is ParsedContextConfigDefinitionData & { schema: Record<string, unknown> } {
  return isPlainObject(value.schema);
}

function generateStandaloneFetchDefinition(
  sourceFile: SourceFile,
  data: ParsedContextConfigDefinitionData
): string {
  sourceFile.addImportDeclaration({
    namedImports: ['fetchDefinition'],
    moduleSpecifier: '@inkeep/agents-core',
  });

  if (isPlainObject(data.responseSchema)) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const fetchVarName = toContextConfigVariableName(data.contextConfigId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fetchVarName,
        initializer: 'fetchDefinition({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(`Failed to create fetch definition declaration '${fetchVarName}'`);
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeFetchDefinition(configObject, data.contextConfigId, data);

  return sourceFile.getFullText().trimEnd();
}

function convertJsonSchemaToZod(schema: Record<string, unknown>): string {
  return convertJsonSchemaToZodSafe(schema, {
    conversionOptions: { module: 'none' },
    emptyObjectAsAny: true,
  });
}

function formatUnknownLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return 'undefined';
  }
}

function extractContextVariableReference(key: string, value: unknown): string | undefined {
  if (typeof value === 'string') {
    return toReferenceIdentifier(value);
  }

  if (!isPlainObject(value)) {
    return undefined;
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
