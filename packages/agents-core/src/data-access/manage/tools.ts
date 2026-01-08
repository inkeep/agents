import { and, count, desc, eq } from 'drizzle-orm';
import type { CredentialStoreRegistry } from '../../credential-stores';
import type { NangoCredentialData } from '../../credential-stores/nango-store';
import { CredentialStuffer } from '../../credential-stuffer';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { subAgentToolRelations, tools } from '../../db/manage/manage-schema';
import type { CredentialReferenceSelect } from '../../types/index';
import {
  type AgentScopeConfig,
  CredentialStoreType,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
  type McpTool,
  type McpToolDefinition,
  type PaginationConfig,
  type ProjectScopeConfig,
  type ToolInsert,
  type ToolSelect,
  type ToolUpdate,
} from '../../types/index';
import {
  detectAuthenticationRequired,
  getCredentialStoreLookupKeyFromRetrievalParams,
  isThirdPartyMCPServerAuthenticated,
  toISODateString,
} from '../../utils';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';
import { McpClient, type McpServerConfig } from '../../utils/mcp-client';
import { getCredentialReference, getUserScopedCredentialReference } from './credentialReferences';
import { updateAgentToolRelation } from './subAgentRelations';

const logger = getLogger('tools');

/**
 * Extract expiration date from credential data stored in credential store
 */
async function getCredentialExpiresAt(
  credentialReference: CredentialReferenceSelect,
  credentialStoreRegistry?: CredentialStoreRegistry
): Promise<string | undefined> {
  if (!credentialReference.retrievalParams) return undefined;

  const credentialStore = credentialStoreRegistry?.get(credentialReference.credentialStoreId);
  if (!credentialStore || credentialStore.type === CredentialStoreType.memory) return undefined;

  const lookupKey = getCredentialStoreLookupKeyFromRetrievalParams({
    retrievalParams: credentialReference.retrievalParams,
    credentialStoreType: credentialStore.type,
  });
  if (!lookupKey) return undefined;

  const credentialDataString = await credentialStore.get(lookupKey);
  if (!credentialDataString) return undefined;

  if (credentialStore.type === CredentialStoreType.nango) {
    const nangoCredentialData = JSON.parse(credentialDataString) as NangoCredentialData;
    return nangoCredentialData.expiresAt
      ? toISODateString(nangoCredentialData.expiresAt)
      : undefined;
  }

  if (credentialStore.type === CredentialStoreType.keychain) {
    const oauthTokens = JSON.parse(credentialDataString);
    return oauthTokens.expires_at ? toISODateString(oauthTokens.expires_at) : undefined;
  }

  return undefined;
}

/**
 * Extract input schema from MCP tool definition, handling multiple formats
 * Different MCP servers may use different schema structures:
 * - inputSchema (direct) - e.g., Notion MCP
 * - parameters.properties - e.g., some other MCP servers
 * - parameters (direct) - alternative format
 * - schema - another possible location
 */
function extractInputSchema(toolDef: any): any {
  if (toolDef.inputSchema) {
    return toolDef.inputSchema;
  }

  if (toolDef.parameters?.properties) {
    return toolDef.parameters.properties;
  }

  if (toolDef.parameters && typeof toolDef.parameters === 'object') {
    return toolDef.parameters;
  }

  if (toolDef.schema) {
    return toolDef.schema;
  }

  return {};
}

const convertToMCPToolConfig = (tool: ToolSelect): MCPToolConfig => {
  if (tool.config.type !== 'mcp') {
    throw new Error(`Cannot convert non-MCP tool to MCP config: ${tool.id}`);
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.name, // Use name as description fallback
    serverUrl: tool.config.mcp.server.url,
    mcpType: tool.config.mcp.server.url.includes('api.nango.dev')
      ? MCPServerType.nango
      : MCPServerType.generic,
    transport: tool.config.mcp.transport,
    headers: tool.headers,
  };
};

const discoverToolsFromServer = async (
  tool: ToolSelect,
  dbClient: AgentsManageDatabaseClient,
  credentialStoreRegistry?: CredentialStoreRegistry,
  userId?: string
): Promise<McpToolDefinition[]> => {
  if (tool.config.type !== 'mcp') {
    throw new Error(`Cannot discover tools from non-MCP tool: ${tool.id}`);
  }

  try {
    let serverConfig: McpServerConfig;

    // Look up credential reference based on scope
    const credentialReference =
      tool.credentialReferenceId && tool.credentialScope !== 'user'
        ? await getCredentialReference(dbClient)({
            scopes: { tenantId: tool.tenantId, projectId: tool.projectId },
            id: tool.credentialReferenceId,
          })
        : userId && tool.credentialScope === 'user'
          ? await getUserScopedCredentialReference(dbClient)({
              scopes: { tenantId: tool.tenantId, projectId: tool.projectId },
              toolId: tool.id,
              userId,
            })
          : undefined;

    if (credentialReference) {
      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      if (!credentialStoreRegistry) {
        throw new Error('CredentialStoreRegistry is required for authenticated tools');
      }
      const credentialStuffer = new CredentialStuffer(credentialStoreRegistry);
      serverConfig = await credentialStuffer.buildMcpServerConfig(
        { tenantId: tool.tenantId, projectId: tool.projectId },
        convertToMCPToolConfig(tool),
        storeReference
      );
    } else {
      const transportType = tool.config.mcp.transport?.type || MCPTransportType.streamableHttp;
      if (transportType === MCPTransportType.sse) {
        serverConfig = {
          type: MCPTransportType.sse,
          url: tool.config.mcp.server.url,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
        };
      } else {
        serverConfig = {
          type: MCPTransportType.streamableHttp,
          url: tool.config.mcp.server.url,
          requestInit: tool.config.mcp.transport?.requestInit,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
          reconnectionOptions: tool.config.mcp.transport?.reconnectionOptions,
          sessionId: tool.config.mcp.transport?.sessionId,
        };
      }
    }

    // Inject user_id for Composio servers at discovery time
    if (serverConfig.url?.toString().includes('composio.dev')) {
      const urlObj = new URL(serverConfig.url.toString());
      if (tool.credentialScope === 'user' && userId) {
        // User-scoped: use actual userId
        urlObj.searchParams.set('user_id', userId);
      } else {
        // Project-scoped: use tenantId||projectId
        const SEPARATOR = '||';
        urlObj.searchParams.set('user_id', `${tool.tenantId}${SEPARATOR}${tool.projectId}`);
      }
      serverConfig.url = urlObj.toString();
    }

    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    await client.connect();

    const serverTools = await client.tools();

    await client.disconnect();

    const toolDefinitions: McpToolDefinition[] = Object.entries(serverTools).map(
      ([name, toolDef]) => ({
        name,
        description: (toolDef as any).description || '',
        inputSchema: extractInputSchema(toolDef as any),
      })
    );

    return toolDefinitions;
  } catch (error) {
    logger.error({ toolId: tool.id, error }, 'Tool discovery failed');
    throw error;
  }
};

export const dbResultToMcpTool = async (
  dbResult: ToolSelect,
  dbClient: AgentsManageDatabaseClient,
  credentialStoreRegistry?: CredentialStoreRegistry,
  relationshipId?: string,
  userId?: string
): Promise<McpTool> => {
  const { headers, capabilities, credentialReferenceId, imageUrl, createdAt, ...rest } = dbResult;

  if (dbResult.config.type !== 'mcp') {
    return {
      ...rest,
      status: 'unknown',
      availableTools: [],
      capabilities: capabilities || undefined,
      credentialReferenceId: credentialReferenceId || undefined,
      createdAt: toISODateString(createdAt),
      updatedAt: toISODateString(dbResult.updatedAt),
      lastError: null,
      headers: headers || undefined,
      imageUrl: imageUrl || undefined,
      relationshipId,
    };
  }

  let availableTools: McpToolDefinition[] = [];
  let status: McpTool['status'] = 'unknown';
  let lastErrorComputed: string | null;
  let expiresAt: string | undefined;
  let createdBy: string | undefined;

  // Look up credential reference based on scope
  const credentialReference =
    credentialReferenceId && dbResult.credentialScope !== 'user'
      ? await getCredentialReference(dbClient)({
          scopes: { tenantId: dbResult.tenantId, projectId: dbResult.projectId },
          id: credentialReferenceId,
        })
      : userId && dbResult.credentialScope === 'user'
        ? await getUserScopedCredentialReference(dbClient)({
            scopes: { tenantId: dbResult.tenantId, projectId: dbResult.projectId },
            toolId: dbResult.id,
            userId,
          })
        : undefined;

  if (credentialReference) {
    createdBy = credentialReference.createdBy || undefined;
    expiresAt = await getCredentialExpiresAt(credentialReference, credentialStoreRegistry);
  }

  const mcpServerUrl = dbResult.config.mcp.server.url;

  try {
    availableTools = await discoverToolsFromServer(
      dbResult,
      dbClient,
      credentialStoreRegistry,
      userId
    );
    status = 'healthy';
    lastErrorComputed = null;
  } catch (error) {
    const toolNeedsAuth =
      error instanceof Error &&
      (await detectAuthenticationRequired({
        serverUrl: mcpServerUrl,
        error,
        logger,
      }));

    status = toolNeedsAuth ? 'needs_auth' : 'unhealthy';

    const errorMessage = error instanceof Error ? error.message : 'Tool discovery failed';

    lastErrorComputed = toolNeedsAuth
      ? `Authentication required - OAuth login needed. ${errorMessage}`
      : errorMessage;
  }

  // Check third-party service status
  const isThirdPartyMCPServer = dbResult.config.mcp.server.url.includes('composio.dev');
  if (isThirdPartyMCPServer) {
    const credentialScope = (dbResult.credentialScope as 'project' | 'user') || 'project';
    const isAuthenticated = await isThirdPartyMCPServerAuthenticated(
      dbResult.tenantId,
      dbResult.projectId,
      mcpServerUrl,
      credentialScope,
      userId
    );

    if (!isAuthenticated) {
      status = 'needs_auth';
      lastErrorComputed = 'Third-party authentication required. Try authenticating again.';
    }
  }

  const now = new Date().toISOString();

  // Update tool metadata - wrap in try-catch to handle serialization conflicts gracefully.
  // Concurrent Tool reads can cause serialization conflicts, so we need to handle them gracefully.
  try {
    await updateTool(dbClient)({
      scopes: { tenantId: dbResult.tenantId, projectId: dbResult.projectId },
      toolId: dbResult.id,
      data: {
        updatedAt: now,
        lastError: lastErrorComputed,
      },
    });
  } catch (updateError: unknown) {
    // Check for serialization conflict (sqlstate 40001, errno 1213)
    const isSerializationConflict =
      updateError instanceof Error &&
      (updateError.message.includes('serialization failure') ||
        updateError.message.includes('40001') ||
        (updateError as any).cause?.code === 'XX000');

    if (isSerializationConflict) {
      logger.debug(
        { toolId: dbResult.id },
        'Skipping tool metadata update due to serialization conflict (concurrent request)'
      );
    } else {
      // For other errors, log warning but don't fail the request
      logger.warn(
        { toolId: dbResult.id, error: updateError },
        'Failed to update tool metadata - continuing with stale data'
      );
    }
  }

  return {
    ...rest,
    status,
    availableTools,
    capabilities: capabilities || undefined,
    credentialReferenceId: credentialReferenceId || undefined,
    createdAt: toISODateString(createdAt),
    createdBy: createdBy || undefined,
    updatedAt: toISODateString(now),
    expiresAt,
    lastError: lastErrorComputed,
    headers: headers || undefined,
    imageUrl: imageUrl || undefined,
    relationshipId,
  };
};

export const getToolById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; toolId: string }) => {
    const result = await db.query.tools.findFirst({
      where: and(
        eq(tools.tenantId, params.scopes.tenantId),
        eq(tools.projectId, params.scopes.projectId),
        eq(tools.id, params.toolId)
      ),
    });
    return result ?? null;
  };

export const listTools =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(tools.tenantId, params.scopes.tenantId),
      eq(tools.projectId, params.scopes.projectId)
    );

    const [toolsDbResults, totalResult] = await Promise.all([
      db
        .select()
        .from(tools)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(tools.createdAt)),
      db.select({ count: count() }).from(tools).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: toolsDbResults,
      pagination: { page, limit, total, pages },
    };
  };

export const createTool = (db: AgentsManageDatabaseClient) => async (params: ToolInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(tools)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const updateTool =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; toolId: string; data: ToolUpdate }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(tools)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(tools.tenantId, params.scopes.tenantId),
          eq(tools.projectId, params.scopes.projectId),
          eq(tools.id, params.toolId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteTool =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; toolId: string }) => {
    const [deleted] = await db
      .delete(tools)
      .where(
        and(
          eq(tools.tenantId, params.scopes.tenantId),
          eq(tools.projectId, params.scopes.projectId),
          eq(tools.id, params.toolId)
        )
      )
      .returning();

    return !!deleted;
  };

export const addToolToAgent =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    toolId: string;
    selectedTools?: string[] | null;
    headers?: Record<string, string> | null;
    toolPolicies?: Record<string, { needsApproval?: boolean }> | null;
  }) => {
    const id = generateId();
    const now = new Date().toISOString();

    const [created] = await db
      .insert(subAgentToolRelations)
      .values({
        id,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.subAgentId,
        toolId: params.toolId,
        selectedTools: params.selectedTools,
        headers: params.headers,
        toolPolicies: params.toolPolicies,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const removeToolFromAgent =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentId: string; toolId: string }) => {
    const [deleted] = await db
      .delete(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.agentId, params.scopes.agentId),
          eq(subAgentToolRelations.subAgentId, params.subAgentId),
          eq(subAgentToolRelations.toolId, params.toolId)
        )
      )
      .returning();

    return deleted;
  };

/**
 * Upsert agent-tool relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentToolRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    toolId: string;
    selectedTools?: string[] | null;
    headers?: Record<string, string> | null;
    toolPolicies?: Record<string, { needsApproval?: boolean }> | null;
    relationId?: string; // Optional: if provided, update specific relationship
  }) => {
    if (params.relationId) {
      return await updateAgentToolRelation(db)({
        scopes: params.scopes,
        relationId: params.relationId,
        data: {
          subAgentId: params.subAgentId,
          toolId: params.toolId,
          selectedTools: params.selectedTools,
          headers: params.headers,
          toolPolicies: params.toolPolicies,
        },
      });
    }

    return await addToolToAgent(db)(params);
  };

/**
 * Upsert a tool (create if it doesn't exist, update if it does)
 */
export const upsertTool =
  (db: AgentsManageDatabaseClient) => async (params: { data: ToolInsert }) => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

    const existing = await getToolById(db)({
      scopes,
      toolId: params.data.id,
    });

    if (existing) {
      return await updateTool(db)({
        scopes,
        toolId: params.data.id,
        data: {
          name: params.data.name,
          config: params.data.config,
          credentialReferenceId: params.data.credentialReferenceId,
          imageUrl: params.data.imageUrl,
          headers: params.data.headers,
        },
      });
    }
    return await createTool(db)(params.data);
  };
