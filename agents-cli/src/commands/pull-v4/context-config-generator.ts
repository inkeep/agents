import { jsonSchemaToZod } from 'json-schema-to-zod';
import {
  IndentationText,
  NewLineKind,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { z } from 'zod';

import { addObjectEntries, addStringProperty, isPlainObject, toCamelCase } from './utils';

type ContextConfigDefinitionData = {
  contextConfigId: string;
  id?: string;
  headers?: string | { id?: string; name?: string };
  headersSchema?: Record<string, unknown>;
  contextVariables?: Record<string, unknown>;
};

const ContextConfigSchema = z.looseObject({
  contextConfigId: z.string().nonempty(),
  id: z.string().optional(),
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

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });

  const parsed = result.data;
  const sourceFile = project.createSourceFile('context-config-definition.ts', '', {
    overwrite: true,
  });

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

  if (value.defaultValue !== undefined) {
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

function convertJsonSchemaToZod(schema: Record<string, unknown>): string {
  try {
    return jsonSchemaToZod(schema, { module: 'none' });
  } catch {
    return 'z.any()';
  }
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

function toContextConfigVariableName(value: string): string {
  const variableName = toCamelCase(value);
  if (!variableName) {
    return 'contextConfigDefinition';
  }
  return variableName;
}

function toReferenceIdentifier(value: string): string {
  const identifier = toCamelCase(value);
  if (!identifier) {
    return 'contextValue';
  }
  return identifier;
}

function formatPropertyName(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key;
  }
  return `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
