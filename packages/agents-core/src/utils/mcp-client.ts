import { z } from '@hono/zod-openapi';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema,
  type ClientCapabilities,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { jsonSchema, tool } from 'ai';
import { asyncExitHook } from 'exit-hook';
import { match } from 'ts-pattern';
import {
  MCP_TOOL_CONNECTION_TIMEOUT_MS,
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS,
  MCP_TOOL_MAX_RETRIES,
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR,
} from '../constants/execution-limits-shared';
import { MCPTransportType } from '../types/utility';
import { getLogger } from './logger';

const logger = getLogger('mcp-client');

export const activeMcpClients = new Set<McpClient>();

let exitHookRegistered = false;

function ensureExitHook() {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  asyncExitHook(
    async () => {
      const clients = Array.from(activeMcpClients);
      const results = await Promise.allSettled(clients.map((c) => c.disconnect()));
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          console.error(
            `[MCP] Failed to disconnect client "${clients[i]?.name}" during exit:`,
            result.reason
          );
        }
      }
    },
    { wait: 5000 }
  );
}

interface SharedServerConfig {
  timeout?: number;
  activeTools?: string[];
  selectedTools?: string[];
}

export interface McpStreamableHttpConfig extends SharedServerConfig {
  type: typeof MCPTransportType.streamableHttp;
  url: string | URL;
  headers?: Record<string, string>;
  requestInit?: StreamableHTTPClientTransportOptions['requestInit'];
  eventSourceInit?: SSEClientTransportOptions['eventSourceInit'];
  reconnectionOptions?: StreamableHTTPClientTransportOptions['reconnectionOptions'];
  sessionId?: StreamableHTTPClientTransportOptions['sessionId'];
}

export interface McpSSEConfig extends SharedServerConfig {
  type: typeof MCPTransportType.sse;
  url: string | URL;
  headers?: Record<string, string>;
  eventSourceInit?: SSEClientTransportOptions['eventSourceInit'];
}

export type McpServerConfig = McpStreamableHttpConfig | McpSSEConfig;

export interface McpClientOptions {
  name: string;
  version?: string;
  server: McpServerConfig;
  capabilities?: ClientCapabilities;
  timeout?: number;
}

///////////////////////////////////////////////////////////////////

export class McpClient {
  name: string;
  private client: Client;
  private readonly timeout: number;
  private transport?: Transport;
  private serverConfig: McpServerConfig;
  private connected = false;

  constructor(opts: McpClientOptions) {
    this.name = opts.name;
    this.timeout = opts.timeout || DEFAULT_REQUEST_TIMEOUT_MSEC;
    this.serverConfig = opts.server;

    this.client = new Client(
      { name: opts.name, version: opts.version || '1.0.0' },
      { capabilities: opts.capabilities || {} }
    );
  }

  isConnected(): boolean {
    return this.connected;
  }

  getInstructions(): string | undefined {
    return this.client.getInstructions();
  }

  async connect() {
    if (this.connected) return;

    await match(this.serverConfig)
      .with({ type: MCPTransportType.streamableHttp }, (config) => this.connectHttp(config))
      .with({ type: MCPTransportType.sse }, (config) => this.connectSSE(config))
      .exhaustive();

    this.connected = true;

    const close = this.client.onclose;
    this.client.onclose = () => {
      this.connected = false;
      if (typeof close === 'function') {
        close();
      }
    };

    ensureExitHook();
    activeMcpClients.add(this);
  }

  private async connectSSE(config: McpSSEConfig) {
    const url = typeof config.url === 'string' ? config.url : config.url.toString();
    const headersToSend = config.headers || {};

    // TS 5.6+ typing mismatch: Node WHATWG `URL` vs DOM `URL` expected by MCP transports.
    // Safe at runtime in Node; remove once types converge upstream.
    // biome-ignore lint: Intentional TS suppression at SDK boundary
    // @ts-ignore: Suppress DOM vs Node URL type mismatch at this boundary
    this.transport = new SSEClientTransport(new URL(url), {
      eventSourceInit: config.eventSourceInit,
      requestInit: {
        headers: headersToSend,
      },
    });

    await this.client.connect(this.transport, {
      timeout: config.timeout ?? this.timeout,
    });
  }

  private async connectHttp(config: McpStreamableHttpConfig) {
    const { url, requestInit } = config;

    // Normalize headers to a plain object for logging and merging
    const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
      if (!headers) return {};
      if (headers instanceof Headers) {
        const obj: Record<string, string> = {};
        headers.forEach((value, key) => {
          obj[key] = value;
        });
        return obj;
      }
      if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
      }
      return headers as Record<string, string>;
    };

    const mergedHeaders: Record<string, string> = {
      ...normalizeHeaders(requestInit?.headers),
      ...(config.headers || {}),
    };

    const mergedRequestInit = {
      ...requestInit,
      headers: mergedHeaders,
    };

    const urlString = typeof url === 'string' ? url : url.toString();

    // See note above — Node WHATWG `URL` vs DOM `URL` typing mismatch.
    // biome-ignore lint: Intentional TS suppression at SDK boundary
    // @ts-ignore: Suppress DOM vs Node URL type mismatch at this boundary
    this.transport = new StreamableHTTPClientTransport(new URL(urlString), {
      requestInit: mergedRequestInit,
      reconnectionOptions: {
        maxRetries: MCP_TOOL_MAX_RETRIES,
        maxReconnectionDelay: MCP_TOOL_MAX_RECONNECTION_DELAY_MS,
        initialReconnectionDelay: MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS,
        reconnectionDelayGrowFactor: MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR,
        ...config.reconnectionOptions,
      },
      sessionId: config.sessionId,
    });
    await this.client.connect(this.transport, { timeout: MCP_TOOL_CONNECTION_TIMEOUT_MS });
  }

  async disconnect() {
    activeMcpClients.delete(this);
    if (!this.transport) {
      return;
    }
    try {
      await this.transport.close();
    } catch (e) {
      console.error(`[MCP] Error disconnecting client "${this.name}":`, e);
      throw e;
    } finally {
      this.transport = undefined;
      this.connected = false;
    }
  }

  private validateSelectedTools(tools: string[], activeTools?: string[]) {
    if (!activeTools) return;
    for (const item of activeTools) {
      if (tools.includes(item)) continue;
      console.warn(`[Tools] Tool ${item} not found in tools`);
    }
  }

  private async selectTools() {
    const { tools } = await this.client.listTools();

    const { selectedTools, activeTools } = this.serverConfig;

    let availableTools: Tool[];

    if (activeTools === undefined) {
      availableTools = tools;
    } else if (activeTools.length === 0) {
      return [];
    } else {
      availableTools = tools.filter((tool: Tool) => activeTools.includes(tool.name));
    }

    if (selectedTools === undefined) {
      return availableTools;
    }
    if (selectedTools.length === 0) {
      return [];
    }
    const toolNames = availableTools.map((tool: Tool) => tool.name);
    this.validateSelectedTools(toolNames, selectedTools);
    return availableTools.filter((tool: Tool) => selectedTools.includes(tool.name));
  }

  async tools() {
    const tools = await this.selectTools();
    const results: Record<string, any> = {};

    for (const def of tools) {
      try {
        // Convert the MCP tool's JSON Schema to a Zod schema with Zod's ref-aware adapter,
        // preserving $ref/$defs, unions, enums, and nesting. Fall back to passing the raw
        // JSON Schema through for any schema z.fromJSONSchema cannot parse.
        let schema: ReturnType<typeof z.fromJSONSchema> | ReturnType<typeof jsonSchema>;
        try {
          schema = z.fromJSONSchema(def.inputSchema as Parameters<typeof z.fromJSONSchema>[0]);
        } catch (conversionError) {
          logger.warn(
            {
              server: this.name,
              tool: def.name,
              error:
                conversionError instanceof Error
                  ? conversionError.message
                  : String(conversionError),
            },
            'z.fromJSONSchema failed; passing raw JSON Schema through'
          );
          schema = jsonSchema((def.inputSchema ?? {}) as Record<string, unknown>);
        }

        const createdTool = tool({
          id: `${this.name}.${def.name}` as const,
          description: def.description || '',
          inputSchema: schema,
          execute: async (context) => {
            const result = await this.client.callTool(
              { name: def.name, arguments: context as Record<string, unknown> },
              CallToolResultSchema,
              { timeout: this.timeout }
            );
            return result;
          },
        });

        if (def.name) {
          results[def.name] = createdTool;
        }
      } catch (e) {
        console.error(`Error creating tool ${def.name}:`, e);
      }
    }

    return results;
  }
}
