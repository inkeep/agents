import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import { addStringProperty, addValueToObject, createInMemoryProject, toCamelCase } from './utils';

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

  return sourceFile.getFullText().trimEnd();
}

function writeFunctionToolConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedFunctionToolDefinitionData
): void {
  addStringProperty(configObject, 'name', data.name);

  if (data.description !== undefined) {
    addStringProperty(configObject, 'description', data.description);
  }

  const inputSchema = data.inputSchema ?? data.schema;
  if (inputSchema !== undefined) {
    const p = configObject.addPropertyAssignment({ name: 'inputSchema', initializer: '{}' });
    const schemaObj = p.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [k, v] of Object.entries(inputSchema)) {
      addValueToObject(schemaObj, k, v);
    }
  }

  const executeCode = data.executeCode ?? data.execute;
  if (executeCode !== undefined) {
    configObject.addPropertyAssignment({
      name: 'execute',
      initializer: executeCode,
    });
  }
}
