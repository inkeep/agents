import { SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createInMemoryProject, toCamelCase } from './utils';

interface CredentialDefinitionData {
  credentialId: string;
  name: string;
  type: string;
  credentialStoreId: string;
  description?: string | null;
  retrievalParams?: unknown;
}

const CredentialSchema = z.object({
  credentialId: z.string().nonempty(),
  name: z.string().nonempty(),
  type: z.string().nonempty(),
  credentialStoreId: z.string().nonempty(),
  description: z.string().optional(),
  retrievalParams: z.unknown().optional(),
});

export function generateCredentialDefinition(data: CredentialDefinitionData): string {
  const result = CredentialSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for credential:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();

  const parsed = result.data;
  const sourceFile = project.createSourceFile('credential-definition.ts', '', { overwrite: true });
  const importName = 'credential';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const credentialVarName = toCamelCase(parsed.credentialId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: credentialVarName, initializer: `${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const { credentialId, ...rest } = parsed;

  for (const [k, v] of Object.entries({ id: credentialId, ...rest })) {
    addValueToObject(configObject, k, v);
  }

  return sourceFile.getFullText();
}
