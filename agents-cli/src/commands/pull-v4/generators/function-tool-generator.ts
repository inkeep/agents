import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { stripExtension } from '../collector-common';
import { buildSequentialNameFileNames, collectFunctionToolEntries } from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { generateSimpleFactoryDefinition } from '../simple-factory-generator';
import { addValueToObject, codeExpression, toToolReferenceName } from '../utils';

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
  return generateSimpleFactoryDefinition(data, {
    schema: FunctionToolSchema,
    factory: {
      importName: 'functionTool',
      variableName: (parsed) => toToolReferenceName(parsed.name || parsed.functionToolId),
    },
    buildConfig(parsed) {
      const { functionToolId: _functionToolId, executeCode: _executeCode, ...rest } = parsed;
      return rest;
    },
    finalize({ parsed, configObject }) {
      if (!parsed.executeCode) {
        return;
      }

      addValueToObject(configObject, 'execute', codeExpression(parsed.executeCode));
    },
  });
}

export const task = {
  type: 'function-tool',
  collect(context) {
    const functionToolEntries = collectFunctionToolEntries(context.project);
    if (!functionToolEntries.length) {
      return [];
    }

    const fileNamesByFunctionToolId = buildSequentialNameFileNames(
      functionToolEntries.map(({ functionToolId, fileName }) => [
        functionToolId,
        { name: fileName },
      ])
    );

    return functionToolEntries.map(({ functionToolId, functionToolData, functionData }) => {
      const modulePath = stripExtension(fileNamesByFunctionToolId[functionToolId]);
      const functionToolName =
        typeof functionToolData.name === 'string' && functionToolData.name.length > 0
          ? functionToolData.name
          : typeof functionData.name === 'string' && functionData.name.length > 0
            ? functionData.name
            : undefined;
      const functionToolDescription =
        typeof functionToolData.description === 'string'
          ? functionToolData.description
          : typeof functionData.description === 'string'
            ? functionData.description
            : undefined;

      return {
        id: functionToolId,
        filePath: context.resolver.resolveOutputFilePath(
          'functionTools',
          functionToolId,
          join(context.paths.toolsDir, `${modulePath}.ts`)
        ),
        payload: {
          functionToolId,
          ...(functionToolName && { name: functionToolName }),
          ...(functionToolDescription !== undefined && { description: functionToolDescription }),
          ...(functionData.inputSchema !== undefined && { inputSchema: functionData.inputSchema }),
          ...(functionData.schema !== undefined && { schema: functionData.schema }),
          ...(functionData.executeCode !== undefined && { executeCode: functionData.executeCode }),
          ...(functionData.dependencies !== undefined && {
            dependencies: functionData.dependencies,
          }),
        } as Parameters<typeof generateFunctionToolDefinition>[0],
      };
    });
  },
  generate: generateFunctionToolDefinition,
} satisfies GenerationTask<Parameters<typeof generateFunctionToolDefinition>[0]>;
