import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createInMemoryProject, toCamelCase } from './utils';

interface FunctionToolDefinitionData {
  functionToolId: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
  schema?: unknown;
  executeCode?: string;
  execute?: string;
}

const FunctionToolSchema = z
  .looseObject({
    functionToolId: z.string().nonempty(),
    name: z.string().nonempty(),
    description: z.string().optional(),
    inputSchema: z.unknown().optional(),
    schema: z.unknown().optional(),
    executeCode: z.string().optional(),
    execute: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.inputSchema === undefined && value.schema === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'inputSchema is required',
        path: ['inputSchema'],
      });
    }

    if (value.executeCode === undefined && value.execute === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'executeCode is required',
        path: ['executeCode'],
      });
    }
  });

type ParsedFunctionToolDefinitionData = z.infer<typeof FunctionToolSchema>;

export function generateFunctionToolDefinition(data: FunctionToolDefinitionData): string {
  const result = FunctionToolSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for function tool:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const project = createInMemoryProject();
  const sourceFile = project.createSourceFile('function-tool-definition.ts', '', {
    overwrite: true,
  });

  sourceFile.addImportDeclaration({
    namedImports: ['functionTool'],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const functionToolVarName = toCamelCase(parsed.functionToolId);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: functionToolVarName,
        initializer: 'functionTool({})',
      },
    ],
  });

  const [declaration] = variableStatement.getDeclarations();
  if (!declaration) {
    throw new Error(
      `Failed to create variable declaration for function tool '${parsed.functionToolId}'`
    );
  }

  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeFunctionToolConfig(configObject, parsed);

  return sourceFile.getFullText();
}

function writeFunctionToolConfig(
  configObject: ObjectLiteralExpression,
  { functionToolId, executeCode, inputSchema, schema, ...rest }: ParsedFunctionToolDefinitionData
): void {
  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  const $inputSchema = inputSchema ?? schema;
  if ($inputSchema) {
    addValueToObject(configObject, 'inputSchema', $inputSchema);
  }

  if (executeCode) {
    configObject.addPropertyAssignment({
      name: 'execute',
      initializer: executeCode,
    });
  }
}
