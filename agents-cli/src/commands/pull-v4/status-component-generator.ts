import { SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  convertJsonSchemaToZodSafe,
  createInMemoryProject,
  toCamelCase,
} from './utils';

interface StatusComponentDefinitionData {
  statusComponentId: string;
  type: string;
  description?: string;
  detailsSchema?: unknown;
  schema?: unknown;
}

const StatusComponentSchema = z.looseObject({
  statusComponentId: z.string().nonempty(),
  type: z.string().nonempty(),
  description: z.string().optional(),
  detailsSchema: z.unknown().optional(),
  schema: z.unknown().optional(),
});

export function generateStatusComponentDefinition(data: StatusComponentDefinitionData): string {
  const result = StatusComponentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for status component:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const detailsSchema = parsed.detailsSchema !== undefined ? parsed.detailsSchema : parsed.schema;

  const project = createInMemoryProject();
  const sourceFile = project.createSourceFile('status-component-definition.ts', '', {
    overwrite: true,
  });
  const importName = 'statusComponent';

  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  if (detailsSchema !== undefined) {
    sourceFile.addImportDeclaration({
      namedImports: ['z'],
      moduleSpecifier: 'zod',
    });
  }

  const statusComponentVarName = toCamelCase(parsed.statusComponentId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: statusComponentVarName, initializer: `${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for status component '${parsed.statusComponentId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const { statusComponentId, id, detailsSchema: _, schema: _2, ...rest } = parsed;

  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  if (detailsSchema) {
    configObject.addPropertyAssignment({
      name: 'detailsSchema',
      initializer: convertJsonSchemaToZodSafe(detailsSchema),
    });
  }

  return sourceFile.getFullText();
}
