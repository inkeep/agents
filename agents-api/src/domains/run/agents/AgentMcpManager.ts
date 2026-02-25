import { z } from '@hono/zod-openapi';
import {
  buildComposioMCPUrl,
  type CredentialStuffer,
  type FullExecutionContext,
  isGithubWorkAppTool,
  JsonTransformer,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
  McpClient,
  type McpServerConfig,
  type McpTool,
} from '@inkeep/agents-core';
import { tool } from 'ai';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { agentSessionManager } from '../services/AgentSession';
import { setSpanWithError, tracer } from '../utils/tracer';
import type { AgentConfig } from './Agent';

const logger = getLogger('AgentMcpManager');

export type McpToolSet = {
  tools: Record<string, any>;
  toolPolicies: Record<string, any>;
  mcpServerId: string;
  mcpServerName: string;
  serverInstructions?: string;
};

export class AgentMcpManager {
  private mcpClientCache: Map<string, McpClient> = new Map();
  private mcpConnectionLocks: Map<string, Promise<McpClient>> = new Map();

  constructor(
    private config: AgentConfig,
    private executionContext: FullExecutionContext,
    private credentialStuffer: CredentialStuffer | undefined,
    private getConversationId: () => string | undefined,
    private getStreamRequestId: () => string | undefined,
    private getRelationshipIdForTool: (toolName: string, toolType: string) => string | undefined
  ) {}

  async getToolSet(tool: McpTool): Promise<McpToolSet> {
    const forwardedHeadersHash = this.config.forwardedHeaders
      ? Object.keys(this.config.forwardedHeaders).sort().join(',')
      : 'no-fwd';
    const cacheKey = `${this.config.tenantId}-${this.config.projectId}-${tool.id}-${tool.credentialReferenceId || 'no-cred'}-${forwardedHeadersHash}`;

    const project = this.executionContext.project;
    const credentialReferenceId = tool.credentialReferenceId;

    const subAgent = project.agents[this.config.agentId]?.subAgents?.[this.config.id];
    const toolRelation = subAgent?.canUse?.find((t) => t.toolId === tool.id);
    const agentToolRelationHeaders = toolRelation?.headers || undefined;
    const selectedTools = toolRelation?.toolSelection || undefined;
    const toolPolicies = toolRelation?.toolPolicies || {};

    let serverConfig: McpServerConfig;

    const isUserScoped = tool.credentialScope === 'user';
    const userId = this.config.userId;
    const conversationId = this.getConversationId();

    if (isUserScoped && userId && this.credentialStuffer) {
      const userCredentialReference = project.credentialReferences
        ? Object.values(project.credentialReferences).find(
            (c) => c.toolId === tool.id && c.userId === userId
          )
        : undefined;

      if (userCredentialReference) {
        const storeReference = {
          credentialStoreId: userCredentialReference.credentialStoreId,
          retrievalParams: userCredentialReference.retrievalParams || {},
        };

        serverConfig = await this.credentialStuffer.buildMcpServerConfig(
          {
            tenantId: this.config.tenantId,
            projectId: this.config.projectId,
            contextConfigId: this.config.contextConfigId || undefined,
            conversationId: conversationId || undefined,
          },
          this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
          storeReference,
          selectedTools
        );
      } else {
        logger.warn(
          { toolId: tool.id, userId },
          'User-scoped tool has no credential connected for this user'
        );
        serverConfig = await this.credentialStuffer.buildMcpServerConfig(
          {
            tenantId: this.config.tenantId,
            projectId: this.config.projectId,
            contextConfigId: this.config.contextConfigId || undefined,
            conversationId: conversationId || undefined,
          },
          this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
          undefined,
          selectedTools
        );
      }
    } else if (credentialReferenceId && this.credentialStuffer) {
      const credentialReference = project.credentialReferences?.[credentialReferenceId];

      if (!credentialReference) {
        throw new Error(`Credential reference not found: ${credentialReferenceId}`);
      }

      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      serverConfig = await this.credentialStuffer.buildMcpServerConfig(
        {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          contextConfigId: this.config.contextConfigId || undefined,
          conversationId: conversationId || undefined,
        },
        this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
        storeReference,
        selectedTools
      );
    } else if (this.credentialStuffer) {
      serverConfig = await this.credentialStuffer.buildMcpServerConfig(
        {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          contextConfigId: this.config.contextConfigId || undefined,
          conversationId: conversationId || undefined,
        },
        this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
        undefined,
        selectedTools
      );
    } else {
      if (tool.config.type !== 'mcp') {
        throw new Error(`Cannot build server config for non-MCP tool: ${tool.id}`);
      }

      serverConfig = {
        type: tool.config.mcp.transport?.type || MCPTransportType.streamableHttp,
        url: tool.config.mcp.server.url,
        activeTools: tool.config.mcp.activeTools,
        selectedTools,
        headers: agentToolRelationHeaders,
      };
    }

    if (isGithubWorkAppTool(tool)) {
      serverConfig.headers = {
        ...serverConfig.headers,
        'x-inkeep-tool-id': tool.id,
        Authorization: `Bearer ${env.GITHUB_MCP_API_KEY}`,
      };
    }

    if (serverConfig.url) {
      serverConfig.url = buildComposioMCPUrl(
        serverConfig.url.toString(),
        this.config.tenantId,
        this.config.projectId,
        isUserScoped ? 'user' : 'project',
        userId
      );
    }

    if (this.config.forwardedHeaders && Object.keys(this.config.forwardedHeaders).length > 0) {
      serverConfig.headers = {
        ...serverConfig.headers,
        ...this.config.forwardedHeaders,
      };
    }

    logger.info(
      {
        toolName: tool.name,
        credentialReferenceId,
        transportType: serverConfig.type,
        headers: tool.headers,
        hasForwardedHeaders: !!this.config.forwardedHeaders,
      },
      'Built MCP server config with credentials'
    );

    let client = this.mcpClientCache.get(cacheKey);

    if (client && !client.isConnected()) {
      this.mcpClientCache.delete(cacheKey);
      client = undefined;
    }

    if (!client) {
      let connectionPromise = this.mcpConnectionLocks.get(cacheKey);

      if (!connectionPromise) {
        connectionPromise = this.createMcpConnection(tool, serverConfig);
        this.mcpConnectionLocks.set(cacheKey, connectionPromise);
      }

      try {
        client = await connectionPromise;
        this.mcpClientCache.set(cacheKey, client);
      } catch (error) {
        this.mcpConnectionLocks.delete(cacheKey);
        logger.error(
          {
            toolName: tool.name,
            subAgentId: this.config.id,
            cacheKey,
            error: error instanceof Error ? error.message : String(error),
          },
          'MCP connection failed'
        );
        throw error;
      }
    }

    const originalTools = await client.tools();
    const tools = await this.applyToolOverrides(originalTools, tool);

    if (!tools || Object.keys(tools).length === 0) {
      this.reportEmptyToolSet(tool, conversationId);
    }

    return {
      tools,
      toolPolicies,
      mcpServerId: tool.id,
      mcpServerName: tool.name,
      // Config prompt overrides take precedence over values sent by the MCP server's initialize response
      serverInstructions: tool.config.mcp.prompt ?? client.getInstructions(),
    };
  }

  private reportEmptyToolSet(mcpTool: McpTool, conversationId: string | undefined): void {
    const streamRequestId = this.getStreamRequestId();
    if (!streamRequestId) return;

    const serverUrl = mcpTool.config.type === 'mcp' ? mcpTool.config.mcp.server.url : 'unknown';

    tracer.startActiveSpan(
      'ai.toolCall',
      {
        attributes: {
          'ai.toolCall.name': mcpTool.name,
          'ai.toolCall.args': JSON.stringify({ operation: 'mcp_tool_discovery' }),
          'ai.toolCall.result': JSON.stringify({
            status: 'no_tools_available',
            message: `MCP server has 0 effective tools. Double check the selected tools in your agent and the active tools in the MCP server configuration.`,
            serverUrl,
            originalToolName: mcpTool.name,
          }),
          'ai.toolType': 'mcp',
          'subAgent.name': this.config.name || 'unknown',
          'subAgent.id': this.config.id || 'unknown',
          'conversation.id': conversationId || 'unknown',
          'agent.id': this.config.agentId || 'unknown',
          'tenant.id': this.config.tenantId || 'unknown',
          'project.id': this.config.projectId || 'unknown',
        },
      },
      (span) => {
        setSpanWithError(span, new Error(`0 effective tools available for ${mcpTool.name}`));
        const relationshipId = this.getRelationshipIdForTool(mcpTool.name, 'mcp');
        agentSessionManager.recordEvent(streamRequestId, 'error', this.config.id, {
          message: `MCP server has 0 effective tools. Double check the selected tools in your graph and the active tools in the MCP server configuration.`,
          code: 'no_tools_available',
          severity: 'error',
          context: { toolName: mcpTool.name, serverUrl, operation: 'mcp_tool_discovery' },
          relationshipId,
        });
        span.end();
      }
    );
  }

  private convertToMCPToolConfig(
    tool: McpTool,
    agentToolRelationHeaders?: Record<string, string>
  ): MCPToolConfig {
    if (tool.config.type !== 'mcp') {
      throw new Error(`Cannot convert non-MCP tool to MCP config: ${tool.id}`);
    }

    return {
      id: tool.id,
      name: tool.name,
      description: tool.name,
      serverUrl: tool.config.mcp.server.url,
      activeTools: tool.config.mcp.activeTools,
      mcpType: tool.config.mcp.server.url.includes('api.nango.dev')
        ? MCPServerType.nango
        : MCPServerType.generic,
      transport: tool.config.mcp.transport,
      headers: {
        ...tool.headers,
        ...agentToolRelationHeaders,
      },
      toolOverrides: tool.config.mcp.toolOverrides,
    };
  }

  private async createMcpConnection(
    tool: McpTool,
    serverConfig: McpServerConfig
  ): Promise<McpClient> {
    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      if (error instanceof Error) {
        if (error?.cause && JSON.stringify(error.cause).includes('ECONNREFUSED')) {
          throw new Error('Connection refused. Please check if the MCP server is running.');
        }
        if (error.message.includes('404')) {
          throw new Error('Error accessing endpoint (HTTP 404)');
        }
        throw new Error(`MCP server connection failed: ${error.message}`);
      }
      throw error;
    }
  }

  private buildOverriddenTool(
    toolName: string,
    toolDef: any,
    override: any,
    mcpToolName: string
  ): { finalName: string; definition: any } {
    let inputSchema: any;
    try {
      inputSchema = override.schema
        ? z.fromJSONSchema(override.schema)
        : (toolDef as any).inputSchema;
    } catch (schemaError) {
      logger.error(
        {
          mcpToolName,
          toolName,
          schemaError: schemaError instanceof Error ? schemaError.message : String(schemaError),
          overrideSchema: override.schema,
        },
        'Failed to convert override schema, using original'
      );
      inputSchema = (toolDef as any).inputSchema;
    }

    const finalName = override.displayName || toolName;
    const description = override.description || (toolDef as any).description || `Tool ${finalName}`;

    const definition = tool({
      description,
      inputSchema,
      execute: async (simpleArgs: any) => {
        let complexArgs = simpleArgs;
        if (override.transformation) {
          try {
            const startTime = Date.now();
            if (typeof override.transformation === 'string') {
              complexArgs = await JsonTransformer.transform(simpleArgs, override.transformation, {
                timeout: 10000,
              });
            } else if (
              typeof override.transformation === 'object' &&
              override.transformation !== null
            ) {
              complexArgs = await JsonTransformer.transformWithConfig(
                simpleArgs,
                { objectTransformation: override.transformation },
                { timeout: 10000 }
              );
            } else {
              logger.warn(
                { mcpToolName, toolName, transformationType: typeof override.transformation },
                'Invalid transformation type, skipping transformation'
              );
            }
            logger.debug(
              {
                mcpToolName,
                toolName,
                transformationDuration: Date.now() - startTime,
                transformation:
                  typeof override.transformation === 'string'
                    ? `${override.transformation.substring(0, 100)}...`
                    : 'object-transformation',
              },
              'Successfully transformed tool arguments'
            );
          } catch (transformError) {
            const errorMessage =
              transformError instanceof Error ? transformError.message : String(transformError);
            logger.error(
              {
                mcpToolName,
                toolName,
                transformError: errorMessage,
                transformation: override.transformation,
                simpleArgs,
              },
              'Failed to transform tool arguments, using original arguments'
            );
            complexArgs = simpleArgs;
          }
        }

        if (typeof (toolDef as any).execute !== 'function') {
          throw new Error(`Original tool ${toolName} does not have a valid execute function`);
        }

        try {
          return await (toolDef as any).execute(complexArgs);
        } catch (executeError) {
          const errorMessage =
            executeError instanceof Error ? executeError.message : String(executeError);
          logger.error(
            { mcpToolName, toolName, executeError: errorMessage, complexArgs },
            'Failed to execute original tool'
          );
          throw new Error(`Tool execution failed for ${toolName}: ${errorMessage}`);
        }
      },
    });

    return { finalName, definition };
  }

  private async applyToolOverrides(originalTools: any, mcpTool: McpTool): Promise<any> {
    const toolOverrides =
      mcpTool.config.type === 'mcp' ? (mcpTool.config as any).mcp?.toolOverrides : undefined;

    if (!toolOverrides) return originalTools;

    if (!originalTools || typeof originalTools !== 'object') {
      logger.warn(
        { mcpToolName: mcpTool.name, originalToolsType: typeof originalTools },
        'Invalid original tools structure, skipping overrides'
      );
      return originalTools || {};
    }

    const availableToolNames = Object.keys(originalTools);
    const overrideNames = Object.keys(toolOverrides);

    const invalidOverrides = overrideNames.filter((name) => !availableToolNames.includes(name));
    if (invalidOverrides.length > 0) {
      logger.warn(
        { mcpToolName: mcpTool.name, invalidOverrides, availableTools: availableToolNames },
        'Tool override configured for non-existent tools'
      );
    }

    const processedTools: any = {};

    for (const [toolName, toolDef] of Object.entries(originalTools)) {
      if (!toolDef || typeof toolDef !== 'object') {
        logger.warn(
          { mcpToolName: mcpTool.name, toolName, toolDefType: typeof toolDef },
          'Invalid tool definition structure, skipping tool'
        );
        continue;
      }

      const override = toolOverrides[toolName];
      if (override && (override.schema || override.description || override.displayName)) {
        try {
          const { finalName, definition } = this.buildOverriddenTool(
            toolName,
            toolDef,
            override,
            mcpTool.name
          );
          processedTools[finalName] = definition;
          logger.info(
            {
              mcpToolName: mcpTool.name,
              originalToolName: toolName,
              finalToolName: finalName,
              hasSchemaOverride: !!override.schema,
              hasDescriptionOverride: !!override.description,
              hasTransformation: !!override.transformation,
            },
            'Successfully applied tool overrides'
          );
        } catch (error) {
          logger.error(
            {
              mcpToolName: mcpTool.name,
              toolName,
              error: error instanceof Error ? error.message : String(error),
              override,
            },
            'Failed to apply tool overrides, using original tool'
          );
          processedTools[toolName] = toolDef;
        }
      } else {
        processedTools[toolName] = toolDef;
      }
    }

    const processedToolNames = Object.keys(processedTools);
    logger.info(
      {
        mcpToolName: mcpTool.name,
        originalToolCount: availableToolNames.length,
        processedToolCount: processedToolNames.length,
        processedTools: processedToolNames,
      },
      'Completed tool override application'
    );

    return processedTools;
  }
}
