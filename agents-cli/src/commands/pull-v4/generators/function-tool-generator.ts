import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toToolReferenceName } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.functions.unwrap().valueType.omit({
  id: true,
});
const MySchema2 = FullProjectDefinitionSchema.shape.functionTools.unwrap().valueType.omit({
  id: true,
  functionId: true,
});

const FunctionToolSchema = z.strictObject({
  ...MySchema.shape,
  ...MySchema2.shape,
  name: z.preprocess((v) => v ?? '', MySchema2.shape.name),
  // Even empty description should exist, otherwise agent-sdk show type error
  // dependencies: z.preprocess(
  //   (v) => (v && Object.keys(v).length && v) || undefined,
  //   MySchema.shape.dependencies
  // ),
  description: z.preprocess((v) => v || undefined, MySchema2.shape.description),
  functionToolId: z.string().nonempty(),
});

type FunctionToolInput = z.input<typeof FunctionToolSchema>;

export function generateFunctionToolDefinition(data: FunctionToolInput): SourceFile {
  const result = FunctionToolSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for function tool:\n${z.prettifyError(result.error)}`);
  }

  const { functionToolId, executeCode, ...parsed } = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'functionTool',
    variableName: toToolReferenceName(parsed.name || functionToolId),
  });

  for (const [k, v] of Object.entries(parsed)) {
    addValueToObject(configObject, k, v);
  }
  if (executeCode) {
    configObject.addPropertyAssignment({
      name: 'execute',
      initializer: executeCode,
    });
  }
  return sourceFile;
}
