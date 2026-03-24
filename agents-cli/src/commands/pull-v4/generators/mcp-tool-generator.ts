import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  createFactoryDefinition,
  formatStringLiteral,
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
  const result = McpToolSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for MCP tool:\n${z.prettifyError(result.error)}`);
  }

  const { credentialReferenceId, config, mcpToolId, ...parsed } = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'mcpTool',
    variableName: toToolReferenceName(parsed.name),
  });

  const activeTools = config?.mcp?.activeTools;
  for (const [k, v] of Object.entries({
    id: mcpToolId,
    ...parsed,
    serverUrl: config?.mcp?.server?.url,
    transport: config?.mcp?.transport,
    ...(activeTools?.length && { activeTools }),
  })) {
    addValueToObject(configObject, k, v);
  }

  if (credentialReferenceId) {
    sourceFile.addImportDeclaration({
      namedImports: ['envSettings'],
      moduleSpecifier: '../environments',
    });
    configObject.addPropertyAssignment({
      name: 'credential',
      initializer: `envSettings.getEnvironmentCredential(${formatStringLiteral(credentialReferenceId)})`,
    });
  }
  return sourceFile;
}
