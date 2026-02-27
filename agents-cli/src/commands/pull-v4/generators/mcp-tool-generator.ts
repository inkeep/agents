import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  createFactoryDefinition,
  formatInlineLiteral,
  formatStringLiteral,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.tools.valueType.omit({
  id: true,
});

const McpToolSchema = z.strictObject({
  mcpToolId: z.string().nonempty(),
  ...MySchema.shape,
});

type McpTooInput = z.input<typeof McpToolSchema>;
type McpTooOutput = z.output<typeof McpToolSchema>;

export function generateMcpToolDefinition(data: McpTooInput): SourceFile {
  const result = McpToolSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for MCP tool:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'mcpTool',
    variableName: toCamelCase(parsed.mcpToolId),
  });

  if (parsed.credentialReferenceId && parsed.credential === undefined) {
    sourceFile.addImportDeclaration({
      namedImports: ['envSettings'],
      moduleSpecifier: '../environments',
    });
  }

  writeMcpToolConfig(configObject, parsed);
  return sourceFile;
}

function writeMcpToolConfig(
  configObject: ObjectLiteralExpression,
  {
    mcpToolId,
    description,
    serverUrl,
    config,
    transport,
    activeTools,
    credential,
    credentialReferenceId,
    ...rest
  }: McpTooOutput
): void {
  for (const [k, v] of Object.entries({
    id: mcpToolId,
    ...rest,
    description: description ?? undefined,
    serverUrl: resolveServerUrl({ config, serverUrl }),
    transport: resolveTransport({ config, transport }),
    activeTools: resolveActiveTools({ config, activeTools }),
  })) {
    addValueToObject(configObject, k, v);
  }
  if (credential !== undefined && credential !== null) {
    if (typeof credential === 'string') {
      configObject.addPropertyAssignment({
        name: 'credential',
        initializer: credential,
      });
      return;
    }

    configObject.addPropertyAssignment({
      name: 'credential',
      initializer: formatInlineLiteral(credential),
    });
    return;
  }

  if (credentialReferenceId) {
    configObject.addPropertyAssignment({
      name: 'credential',
      initializer: `envSettings.getEnvironmentCredential(${formatStringLiteral(credentialReferenceId)})`,
    });
  }
}

function resolveServerUrl(data: Pick<McpTooOutput, 'config' | 'serverUrl'>): string | undefined {
  return data.config?.mcp?.server?.url ?? data.serverUrl;
}

function resolveTransport(data: Pick<McpTooOutput, 'transport' | 'config'>): unknown {
  return data.config?.mcp?.transport ?? data.transport;
}

function resolveActiveTools(
  data: Pick<McpTooOutput, 'config' | 'activeTools'>
): unknown[] | undefined {
  return data.config?.mcp?.activeTools ?? data.activeTools;
}
