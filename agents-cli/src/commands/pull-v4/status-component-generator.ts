import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addStringProperty,
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

type ParsedStatusComponentDefinitionData = z.infer<typeof StatusComponentSchema>;

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

  sourceFile.addImportDeclaration({
    namedImports: ['statusComponent'],
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
    declarations: [
      {
        name: statusComponentVarName,
        initializer: 'statusComponent({})',
      },
    ],
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

  writeStatusComponentConfig(configObject, parsed, detailsSchema);

  return sourceFile.getFullText().trimEnd();
}

function writeStatusComponentConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedStatusComponentDefinitionData,
  detailsSchema: unknown
): void {
  addStringProperty(configObject, 'type', data.type);

  if (data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (detailsSchema !== undefined) {
    configObject.addPropertyAssignment({
      name: 'detailsSchema',
      initializer: convertJsonSchemaToZodSafe(detailsSchema, {}),
    });
  }
}
