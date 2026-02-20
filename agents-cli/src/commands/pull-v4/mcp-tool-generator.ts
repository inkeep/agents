import { type ObjectLiteralExpression, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addObjectEntries,
  addStringProperty,
  createFactoryDefinition,
  formatInlineLiteral,
  formatStringLiteral,
  isPlainObject,
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
  .looseObject({
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
    transport: z.unknown().optional(),
    activeTools: z.array(z.unknown()).optional(),
    imageUrl: z.string().optional(),
    headers: z.unknown().optional(),
    credential: z.unknown().optional(),
    credentialReferenceId: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!resolveServerUrl(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'serverUrl is required (from config.mcp.server.url or serverUrl)',
        path: ['serverUrl'],
      });
    }
  });

type ParsedMcpToolDefinitionData = z.infer<typeof McpToolSchema>;

export function generateMcpToolDefinition(data: McpToolDefinitionData): string {
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

  return sourceFile.getFullText();
}

function writeMcpToolConfig(
  configObject: ObjectLiteralExpression,
  data: ParsedMcpToolDefinitionData
): void {
  addStringProperty(configObject, 'id', data.mcpToolId);
  addStringProperty(configObject, 'name', data.name);
  addStringProperty(configObject, 'serverUrl', resolveServerUrl(data));

  const transport = resolveTransport(data);
  if (transport !== undefined) {
    configObject.addPropertyAssignment({
      name: 'transport',
      initializer: formatInlineLiteral(transport),
    });
  }

  const activeTools = resolveActiveTools(data);
  if (activeTools?.length) {
    configObject.addPropertyAssignment({
      name: 'activeTools',
      initializer: formatInlineLiteral(activeTools),
    });
  }

  if (data.description !== undefined && data.description !== null) {
    addStringProperty(configObject, 'description', data.description);
  }

  if (data.imageUrl !== undefined) {
    addStringProperty(configObject, 'imageUrl', data.imageUrl);
  }

  if (isPlainObject(data.headers) && Object.keys(data.headers).length > 0) {
    const headersProperty = configObject.addPropertyAssignment({
      name: 'headers',
      initializer: '{}',
    });
    const headersObject = headersProperty.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression
    );
    addObjectEntries(headersObject, data.headers);
  }

  if (data.credential !== undefined && data.credential !== null) {
    if (typeof data.credential === 'string') {
      configObject.addPropertyAssignment({
        name: 'credential',
        initializer: data.credential,
      });
      return;
    }

    configObject.addPropertyAssignment({
      name: 'credential',
      initializer: formatInlineLiteral(data.credential),
    });
    return;
  }

  if (data.credentialReferenceId) {
    configObject.addPropertyAssignment({
      name: 'credential',
      initializer: `envSettings.getEnvironmentCredential(${formatStringLiteral(data.credentialReferenceId)})`,
    });
  }
}

function resolveServerUrl(data: ParsedMcpToolDefinitionData): string {
  const urlFromConfig =
    isPlainObject(data.config) &&
    isPlainObject(data.config.mcp) &&
    isPlainObject(data.config.mcp.server) &&
    typeof data.config.mcp.server.url === 'string'
      ? data.config.mcp.server.url
      : undefined;

  if (urlFromConfig) {
    return urlFromConfig;
  }

  return data.serverUrl ?? '';
}

function resolveTransport(data: ParsedMcpToolDefinitionData): unknown {
  const transportFromConfig =
    isPlainObject(data.config) && isPlainObject(data.config.mcp)
      ? data.config.mcp.transport
      : undefined;

  if (transportFromConfig !== undefined) {
    return transportFromConfig;
  }

  return data.transport;
}

function resolveActiveTools(data: ParsedMcpToolDefinitionData): unknown[] | undefined {
  const activeToolsFromConfig =
    isPlainObject(data.config) && isPlainObject(data.config.mcp)
      ? data.config.mcp.activeTools
      : undefined;

  if (Array.isArray(activeToolsFromConfig)) {
    return activeToolsFromConfig;
  }

  if (Array.isArray(data.activeTools)) {
    return data.activeTools;
  }

  return undefined;
}
