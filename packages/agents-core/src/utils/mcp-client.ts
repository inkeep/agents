import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, type ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';

import { tool } from 'ai';
import { asyncExitHook, gracefulExit } from 'exit-hook';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { MCPTransportType } from '../types/utility';

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

    asyncExitHook(() => this.disconnect(), { wait: 5000 });
    process.on('SIGTERM', () => gracefulExit());
  }

  private async connectSSE(config: McpSSEConfig) {
    const url = typeof config.url === 'string' ? config.url : config.url.toString();

    this.transport = new SSEClientTransport(new URL(url), {
      eventSourceInit: config.eventSourceInit,
      requestInit: {
        headers: config.headers || {},
      },
    });

    await this.client.connect(this.transport, {
      timeout: config.timeout ?? this.timeout,
    });
  }

  private async connectHttp(config: McpStreamableHttpConfig) {
    const { url, requestInit } = config;

    const mergedRequestInit = {
      ...requestInit,
      headers: {
        ...(requestInit?.headers || {}),
        ...(config.headers || {}),
      },
    };

    const urlObj = new URL(url);
    this.transport = new StreamableHTTPClientTransport(urlObj, {
      requestInit: mergedRequestInit,
      reconnectionOptions: {
        maxRetries: 3,
        maxReconnectionDelay: 30000,
        initialReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.5,
        ...config.reconnectionOptions,
      },
      sessionId: config.sessionId,
    });
    await this.client.connect(this.transport, { timeout: 3000 });
  }

  async disconnect() {
    if (!this.transport) {
      return;
    }
    try {
      await this.transport.close();
    } catch (e) {
      console.error(e);
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
    const { tools } = await this.client.listTools({ timeout: this.timeout });

    const { selectedTools, activeTools } = this.serverConfig;

    // Priority: selectedTools > activeTools > all tools
    let toolsToFilter: string[] | undefined;

    if (selectedTools && selectedTools.length > 0) {
      // Use selectedTools (user's specific selection from UI)
      toolsToFilter = selectedTools;
    } else if (activeTools && activeTools.length > 0) {
      // Fall back to activeTools (available tools)
      toolsToFilter = activeTools;
    } else {
      // No filtering - return all tools
      return tools;
    }

    const toolNames = tools.map((tool) => tool.name);
    this.validateSelectedTools(toolNames, toolsToFilter);

    return tools.filter((tool) => toolsToFilter.includes(tool.name));
  }

  async tools() {
    const tools = await this.selectTools();
    const results: Record<string, any> = {};

    for (const def of tools) {
      try {
        // Convert JSON Schema to Zod schema
        const createZodSchema = (inputSchema: any) => {
          if (!inputSchema || !inputSchema.properties) {
            return z.object({});
          }

          const zodProperties: Record<string, any> = {};

          for (const [key, prop] of Object.entries(inputSchema.properties)) {
            const propDef = prop as any;
            let zodType: z.ZodTypeAny;

            switch (propDef.type) {
              case 'string':
                zodType = z.string();
                break;
              case 'number':
                zodType = z.number();
                break;
              case 'boolean':
                zodType = z.boolean();
                break;
              case 'array':
                zodType = z.array(z.any());
                break;
              default:
                zodType = z.any();
            }

            if (propDef.description) {
              zodType = zodType.describe(propDef.description);
            }

            // Make field optional if not in required array
            const isRequired = inputSchema.required?.includes(key);
            if (!isRequired) {
              zodType = zodType.optional();
            }

            zodProperties[key] = zodType;
          }

          return z.object(zodProperties);
        };

        const schema = createZodSchema(def.inputSchema);

        const createdTool = tool({
          id: `${this.name}.${def.name}` as const,
          description: def.description || '',
          inputSchema: schema,
          execute: async (context) => {
            const result = await this.client.callTool(
              { name: def.name, arguments: context },
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
