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

import { addStringProperty, isPlainObject, toCamelCase } from './utils';

type ContextConfigDefinitionData = {
  contextConfigId: string;
  id?: string;
  headers?: string | { id?: string; name?: string };
  contextVariables?: Record<string, unknown>;
};

const ContextConfigSchema = z.looseObject({
  contextConfigId: z.string().nonempty(),
  id: z.string().optional(),
  headers: z.union([z.string(), z.looseObject({ id: z.string().optional() })]).optional(),
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
  sourceFile.addImportDeclaration({
    namedImports: ['contextConfig'],
    moduleSpecifier: '@inkeep/agents-core',
  });

  const contextConfigVarName = toContextConfigVariableName(parsed.contextConfigId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
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

  writeContextConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

export const generateContextConfigDefinitionV4 = generateContextConfigDefinition;

function writeContextConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedContextConfigDefinitionData
) {
  if (data.id !== undefined) {
    addStringProperty(configObject, 'id', data.id);
  }

  const headersRef = extractHeadersReference(data.headers);
  if (headersRef) {
    configObject.addPropertyAssignment({
      name: 'headers',
      initializer: toReferenceIdentifier(headersRef),
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
