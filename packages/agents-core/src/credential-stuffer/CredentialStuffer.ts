import { TemplateEngine } from '../context/TemplateEngine';
import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry';
import type { NangoCredentialData } from '../credential-stores/nango-store';
import {
  CredentialStoreType,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
} from '../types/index';
import { getCredentialStoreLookupKeyFromRetrievalParams } from '../utils/credential-store-utils';
import { getLogger, type PinoLogger } from '../utils/logger';
import type { McpServerConfig } from '../utils/mcp-client';

/**
 * Context object for credential operations
 */
export interface CredentialContext {
  /** Tenant identifier */
  tenantId: string;

  /** Project identifier */
  projectId: string;

  /** Conversation identifier */
  conversationId?: string;

  /** Context configuration identifier */
  contextConfigId?: string;

  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Base credential data structure containing headers and metadata
 */
export interface CredentialData {
  /** HTTP headers for authentication */
  headers: Record<string, string>;
  /** Additional metadata for the credentials */
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

/**
 * Credential store reference for lookups
 */
export interface CredentialStoreReference {
  /** Framework credential store ID */
  credentialStoreId: string;
  /** Configuration parameters for credential retrieval */
  retrievalParams: Record<string, unknown>;
}

export interface CredentialResolverInput {
  context: CredentialContext;
  mcpType?: MCPToolConfig['mcpType'];
  storeReference?: CredentialStoreReference;
  headers?: Record<string, string>;
}

/**
 * Interface for context resolver (optional)
 */
export interface ContextResolverInterface {
  resolveHeaders(
    conversationId: string,
    contextConfigId: string
  ): Promise<Record<string, unknown>>;
}

/**
 * Manages credential retrieval and injection for MCP tools
 * Uses CredentialStoreRegistry for credential store management
 */
export class CredentialStuffer {
  private readonly logger: PinoLogger;

  constructor(
    private credentialStoreRegistry: CredentialStoreRegistry,
    private contextResolver?: ContextResolverInterface,
    logger?: PinoLogger
  ) {
    this.logger = logger || getLogger('credential-stuffer');
  }

  /**
   * Retrieve credentials from credential store registry
   */
  async getCredentials(
    context: CredentialContext,
    storeReference: CredentialStoreReference,
    mcpType?: MCPToolConfig['mcpType']
  ): Promise<CredentialData | null> {
    const credentialStore = this.credentialStoreRegistry.get(storeReference.credentialStoreId);
    if (!credentialStore) {
      this.logger.warn(
        {
          tenantId: context.tenantId,
          credentialStoreId: storeReference.credentialStoreId,
          availableStores: this.credentialStoreRegistry.getIds(),
        },
        'Credential store not found in registry'
      );
      return null;
    }

    const key = this.generateCredentialKey(context, storeReference, credentialStore.type);

    const credentialDataString = await credentialStore.get(key);

    if (!credentialDataString) {
      this.logger.warn(
        {
          tenantId: context.tenantId,
          credentialStoreId: storeReference.credentialStoreId,
          lookupKey: key,
        },
        'No credential data found for key'
      );
      return null;
    }

    if (credentialStore.type === CredentialStoreType.nango) {
      try {
        const nangoCredentialData = JSON.parse(credentialDataString) as NangoCredentialData;

        if (mcpType === MCPServerType.nango) {
          return {
            headers: {
              Authorization: `Bearer ${nangoCredentialData.secretKey}`,
              'provider-config-key': nangoCredentialData.providerConfigKey,
              'connection-id': nangoCredentialData.connectionId,
            },
            metadata: nangoCredentialData.metadata,
          };
        }

        const headers: Record<string, string> = {};
        if (nangoCredentialData.token) {
          headers.Authorization = `Bearer ${nangoCredentialData.token}`;
        }
        return {
          headers,
          metadata: nangoCredentialData.metadata,
        };
      } catch (parseError) {
        this.logger.error(
          {
            tenantId: context.tenantId,
            credentialStoreId: storeReference.credentialStoreId,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          },
          'Failed to parse credential data JSON'
        );
        return null;
      }
    }

    if (credentialStore.type === CredentialStoreType.keychain) {
      try {
        const oauthTokens = JSON.parse(credentialDataString);
        if (oauthTokens.access_token) {
          return {
            headers: {
              Authorization: `Bearer ${oauthTokens.access_token}`,
            },
            metadata: {},
          };
        }
      } catch {
      }
    }

    return {
      headers: {
        Authorization: `Bearer ${credentialDataString}`,
      },
    };
  }

  /**
   * Generate credential lookup key based on store type
   */
  private generateCredentialKey(
    context: CredentialContext,
    storeReference: CredentialStoreReference,
    credentialStoreType: keyof typeof CredentialStoreType
  ): string {
    return (
      getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: storeReference.retrievalParams,
        credentialStoreType,
      }) || context.tenantId
    );
  }

  /**
   * Get credentials from headers context
   */
  async getCredentialsFromHeaders(
    credentialContext: CredentialContext,
    headers: Record<string, string>
  ): Promise<CredentialData | null> {
    const contextConfigId = credentialContext.contextConfigId;
    const conversationId = credentialContext.conversationId;

    if (!contextConfigId || !conversationId || !this.contextResolver) {
      return null;
    }

    const context = await this.contextResolver.resolveHeaders(
      conversationId,
      contextConfigId
    );

    const resolvedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      resolvedHeaders[key] = TemplateEngine.render(
        value,
        context,
        { strict: true }
      );
    }

    return {
      headers: resolvedHeaders,
      metadata: {},
    };
  }

  /**
   * Get credential headers for MCP server configuration
   */
  async getCredentialHeaders({
    context,
    mcpType,
    storeReference,
    headers,
  }: CredentialResolverInput): Promise<Record<string, string>> {
    let credentialsFromHeaders: CredentialData | null = null;
    if (context.contextConfigId && context.conversationId && headers) {
      credentialsFromHeaders = await this.getCredentialsFromHeaders(context, headers);
    }

    let credentialStoreHeaders: CredentialData | null = null;
    if (storeReference) {
      credentialStoreHeaders = await this.getCredentials(context, storeReference, mcpType);
    }

    if (!credentialStoreHeaders) {
      return credentialsFromHeaders ? credentialsFromHeaders.headers : {};
    }

    const combinedHeaders = {
      ...credentialStoreHeaders.headers,
      ...credentialStoreHeaders.metadata,
      ...credentialsFromHeaders?.headers,
    };

    return combinedHeaders;
  }

  /**
   * Build MCP server configuration with credentials
   */
  async buildMcpServerConfig(
    context: CredentialContext,
    tool: MCPToolConfig,
    storeReference?: CredentialStoreReference,
    selectedTools?: string[]
  ): Promise<McpServerConfig> {
    let credentialHeaders: Record<string, string> = {};
    if (storeReference || tool.headers) {
      credentialHeaders = await this.getCredentialHeaders({
        context: context,
        mcpType: tool.mcpType,
        storeReference,
        headers: tool.headers || {},
      });
    }

    const baseConfig = {
      type: tool.transport?.type || MCPTransportType.streamableHttp,
      url: tool.serverUrl,
      activeTools: tool.activeTools,
      selectedTools,
    };

    if (
      baseConfig.type === MCPTransportType.streamableHttp ||
      baseConfig.type === MCPTransportType.sse
    ) {
      const httpConfig = {
        ...baseConfig,
        url: tool.serverUrl,
        headers: {
          ...tool.headers,
          ...credentialHeaders,
        },
      };

      return httpConfig;
    }

    return baseConfig;
  }
}
