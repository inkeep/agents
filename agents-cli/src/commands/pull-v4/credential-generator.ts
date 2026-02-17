import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addStringProperty,
  createInMemoryProject,
  isPlainObject,
  toCamelCase,
} from './utils';

interface CredentialDefinitionData {
  credentialId: string;
  name: string;
  type: string;
  credentialStoreId: string;
  description?: string | null;
  retrievalParams?: unknown;
}

const CredentialSchema = z.looseObject({
  credentialId: z.string().nonempty(),
  name: z.string().nonempty(),
  type: z.string().nonempty(),
  credentialStoreId: z.string().nonempty(),
  description: z.string().nullable().optional(),
  retrievalParams: z.unknown().optional(),
});

type ParsedCredentialDefinitionData = z.infer<typeof CredentialSchema>;

export function generateCredentialDefinition(data: CredentialDefinitionData): string {
  const result = CredentialSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Missing required fields for credential:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data;
  const sourceFile = project.createSourceFile('credential-definition.ts', '', { overwrite: true });
  sourceFile.addImportDeclaration({
    namedImports: ['credential'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const credentialVarName = toCamelCase(parsed.credentialId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: credentialVarName,
        initializer: 'credential({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for credential '${parsed.credentialId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeCredentialConfig(configObject, parsed);

  return sourceFile.getFullText().trimEnd();
}

function writeCredentialConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedCredentialDefinitionData
) {
  addStringProperty(configObject, 'id', data.credentialId);
  addStringProperty(configObject, 'name', data.name);
  addStringProperty(configObject, 'type', data.type);
  addStringProperty(configObject, 'credentialStoreId', data.credentialStoreId);

  if (data.description) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (isPlainObject(data.retrievalParams)) {
    const retrievalParamsProperty = configObject.addPropertyAssignment({
      name: 'retrievalParams',
      initializer: '{}',
    });
    const retrievalParamsObject = retrievalParamsProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addObjectEntries(retrievalParamsObject, data.retrievalParams);
  }
}
