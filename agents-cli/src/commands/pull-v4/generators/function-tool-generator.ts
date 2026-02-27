import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.functions.unwrap().valueType.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
const MySchema2 = FullProjectDefinitionSchema.shape.functionTools.unwrap().valueType.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  functionId: true,
});

const FunctionToolSchema = z.strictObject({
  ...MySchema.shape,
  ...MySchema2.shape,
  functionToolId: z.string().nonempty(),
});

type FunctionToolInput = z.input<typeof FunctionToolSchema>;
type FunctionToolOutput = z.output<typeof FunctionToolSchema>;

export function generateFunctionToolDefinition(data: FunctionToolInput): SourceFile {
  const result = FunctionToolSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for function tool:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'functionTool',
    variableName: toCamelCase(parsed.functionToolId),
  });

  writeFunctionToolConfig(configObject, parsed);
  return sourceFile;
}

function writeFunctionToolConfig(
  configObject: ObjectLiteralExpression,
  { functionToolId, executeCode, inputSchema, schema, ...rest }: FunctionToolOutput
): void {
  for (const [k, v] of Object.entries({
    ...rest,
    inputSchema: inputSchema ?? schema,
  })) {
    addValueToObject(configObject, k, v);
  }
  if (executeCode) {
    configObject.addPropertyAssignment({
      name: 'execute',
      initializer: executeCode,
    });
  }
}
