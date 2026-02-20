import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from './utils';

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

export function generateFunctionToolDefinition(data: FunctionToolDefinitionData): SourceFile {
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
  { functionToolId, executeCode, inputSchema, schema, ...rest }: ParsedFunctionToolDefinitionData
): void {
  for (const [k, v] of Object.entries({
    ...rest,
    inputShema: inputSchema ?? schema
  })) {
    addValueToObject(configObject, k, v);
  }
}
