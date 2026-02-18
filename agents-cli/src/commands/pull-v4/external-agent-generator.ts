import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import { addStringProperty, createInMemoryProject, toCamelCase } from './utils';

interface ExternalAgentDefinitionData {
  externalAgentId: string;
  name: string;
  description?: string | null;
  baseUrl: string;
  credentialReference?:
    | string
    | {
        id?: string;
        name?: string;
        description?: string;
      };
}

const ExternalAgentSchema = z.looseObject({
  externalAgentId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullable().optional(),
  baseUrl: z.string().nonempty(),
  credentialReference: z
    .union([
      z.string(),
      z.looseObject({
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
      }),
    ])
    .optional(),
});

type ParsedExternalAgentDefinitionData = z.infer<typeof ExternalAgentSchema>;

export function generateExternalAgentDefinition(data: ExternalAgentDefinitionData): string {
  const result = ExternalAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for external agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const project = createInMemoryProject();
  const sourceFile = project.createSourceFile('external-agent-definition.ts', '', {
    overwrite: true,
  });
  sourceFile.addImportDeclaration({
    namedImports: ['externalAgent'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  if (typeof parsed.credentialReference === 'string') {
    sourceFile.addImportDeclaration({
      namedImports: [toCamelCase(parsed.credentialReference)],
      moduleSpecifier: `../credentials/${parsed.credentialReference}`,
    });
  }

  const externalAgentVarName = toCamelCase(parsed.externalAgentId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: externalAgentVarName,
        initializer: 'externalAgent({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for external agent '${parsed.externalAgentId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeExternalAgentConfig(configObject, parsed);

  return sourceFile.getFullText();
}

function writeExternalAgentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedExternalAgentDefinitionData
): void {
  addStringProperty(configObject, 'id', data.externalAgentId);
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== null && data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  } else {
    addStringProperty(configObject, 'description', `External agent ${data.externalAgentId}`);
  }

  addStringProperty(configObject, 'baseUrl', data.baseUrl);

  if (typeof data.credentialReference === 'string') {
    configObject.addPropertyAssignment({
      name: 'credentialReference',
      initializer: toCamelCase(data.credentialReference),
    });
    return;
  }

  if (!data.credentialReference) {
    return;
  }

  const credentialReferenceProperty = configObject.addPropertyAssignment({
    name: 'credentialReference',
    initializer: '{}',
  });
  const credentialReferenceObject = credentialReferenceProperty.getInitializerIfKindOrThrow(
    SyntaxKind.ObjectLiteralExpression
  );

  if (data.credentialReference.id !== undefined) {
    addStringProperty(credentialReferenceObject, 'id', data.credentialReference.id);
  }

  if (data.credentialReference.name !== undefined) {
    addStringProperty(credentialReferenceObject, 'name', data.credentialReference.name);
  }

  if (data.credentialReference.description !== undefined) {
    addStringProperty(
      credentialReferenceObject,
      'description',
      data.credentialReference.description
    );
  }
}
