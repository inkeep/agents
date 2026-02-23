import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import {
  addValueToObject,
  createFactoryDefinition,
  formatInlineLiteral,
  formatStringLiteral,
  toCamelCase,
} from './utils';

interface McpToolDefinitionData {
  mcpToolId: string;
  name: string;
  description?: string | null;
  config?: unknown;
  serverUrl?: string;
  transport?: unknown;
  activeTools?: unknown[];
  imageUrl?: string;
  headers?: unknown;
  credential?: unknown;
  credentialReferenceId?: string;
}

const McpToolSchema = z
  .object({
    mcpToolId: z.string().nonempty(),
    name: z.string().nonempty(),
    description: z.string().nullable().optional(),
    config: z
      .looseObject({
        mcp: z
          .looseObject({
            server: z
              .looseObject({
                url: z.string().optional(),
              })
              .optional(),
            transport: z.unknown().optional(),
            activeTools: z.array(z.unknown()).optional(),
          })
          .optional(),
      })
      .optional(),
    serverUrl: z.string().optional(),
    transport: z.object({ type: z.string() }).optional(),
    activeTools: z.array(z.unknown()).optional(),
    imageUrl: z.string().nullish(),
    headers: z.unknown().optional(),
    credential: z.unknown().optional(),
    credentialReferenceId: z.string().nullish(),
  })
  .superRefine((value, context) => {
    if (!resolveServerUrl(value)) {
      context.addIssue({
        code: 'custom',
        message: 'serverUrl is required (from config.mcp.server.url or serverUrl)',
        path: ['serverUrl'],
      });
    }
  });

type ParsedMcpToolDefinitionData = z.infer<typeof McpToolSchema>;

export function generateMcpToolDefinition(data: McpToolDefinitionData): SourceFile {
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
  }: ParsedMcpToolDefinitionData
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

function resolveServerUrl(
  data: Pick<ParsedMcpToolDefinitionData, 'config' | 'serverUrl'>
): string | undefined {
  return data.config?.mcp?.server?.url ?? data.serverUrl;
}

function resolveTransport(
  data: Pick<ParsedMcpToolDefinitionData, 'transport' | 'config'>
): unknown {
  return data.config?.mcp?.transport ?? data.transport;
}

function resolveActiveTools(
  data: Pick<ParsedMcpToolDefinitionData, 'config' | 'activeTools'>
): unknown[] | undefined {
  return data.config?.mcp?.activeTools ?? data.activeTools;
}
