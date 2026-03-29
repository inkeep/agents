import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { buildSequentialNameFileNames } from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { addNamedImports, applyImportPlan, createImportPlan } from '../import-plan';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  codeCall,
  codePropertyAccess,
  codeReference,
  toToolReferenceName,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.tools.valueType.omit({
  id: true,
  lastError: true,
});

const McpToolSchema = z.strictObject({
  mcpToolId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v ?? undefined, MySchema.shape.description),
  headers: z.preprocess((v) => v ?? undefined, MySchema.shape.headers),
  capabilities: z.preprocess(
    (v) => (v && Object.keys(v).length && v) || undefined,
    MySchema.shape.capabilities
  ),
  imageUrl: z.preprocess((v) => v || undefined, MySchema.shape.imageUrl),
  // Additional field
  credential: z.record(z.string(), z.unknown()).optional(),
});

type McpToolInput = z.input<typeof McpToolSchema>;

export function generateMcpToolDefinition({
  tenantId,
  id,
  projectId,
  createdAt,
  updatedAt,
  lastError,
  ...data
}: McpToolInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: McpToolSchema,
    factory: {
      importName: 'mcpTool',
      variableName: (parsed) => toToolReferenceName(parsed.name),
    },
    render({ parsed, sourceFile, configObject }) {
      const { credentialReferenceId, config, mcpToolId, ...rest } = parsed;

      const activeTools = config?.mcp?.activeTools;
      for (const [k, v] of Object.entries({
        id: mcpToolId,
        ...rest,
        serverUrl: config?.mcp?.server?.url,
        transport: config?.mcp?.transport,
        ...(activeTools?.length && { activeTools }),
      })) {
        addValueToObject(configObject, k, v);
      }

      const importPlan = createImportPlan();
      if (credentialReferenceId) {
        addNamedImports(importPlan, '../environments', 'envSettings');
        addValueToObject(
          configObject,
          'credential',
          codeCall(
            codePropertyAccess(codeReference('envSettings'), 'getEnvironmentCredential'),
            credentialReferenceId
          )
        );
      }
      applyImportPlan(sourceFile, importPlan);
    },
  });
}

export const task = {
  type: 'tool',
  collect(context) {
    const toolEntries = Object.entries(context.project.tools ?? {});
    const fileNamesByToolId = buildSequentialNameFileNames(toolEntries);

    return toolEntries.map(([toolId, toolData]) => ({
      id: toolId,
      filePath: context.resolver.resolveOutputFilePath(
        'tools',
        toolId,
        join(context.paths.toolsDir, fileNamesByToolId[toolId])
      ),
      payload: {
        mcpToolId: toolId,
        ...toolData,
      } as Parameters<typeof generateMcpToolDefinition>[0],
    }));
  },
  generate: generateMcpToolDefinition,
} satisfies GenerationTask<Parameters<typeof generateMcpToolDefinition>[0]>;
