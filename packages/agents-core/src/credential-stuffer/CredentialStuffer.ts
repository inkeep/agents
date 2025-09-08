import type { CredentialStoreRegistry } from '../credential-stores/CredentialStoreRegistry.js';
import { getCredentialStoreLookupKeyFromRetrievalParams } from '../utils/credential-store-utils.js';
import { getLogger, type Logger } from '../utils/logger.js';
import { TemplateEngine } from '../context/TemplateEngine.js';
import type { NangoCredentialData } from '../credential-stores/nango-store.js';
import type { MCPToolConfig } from '../types/index.js';
import type { McpServerConfig } from '../utils/mcp-client.js';

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
  resolveRequestContext(
    conversationId: string,
    contextConfigId: string
  ): Promise<Record<string, unknown>>;
}

/**
 * Manages credential retrieval and injection for MCP tools
 * Uses CredentialStoreRegistry for credential store management
 */
export class CredentialStuffer {
  private readonly logger: Logger;

  constructor(
    private credentialStoreRegistry: CredentialStoreRegistry,
    private contextResolver?: ContextResolverInterface,
    logger?: Logger
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
    // Get the credential store from registry
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

    if (credentialStore.type === 'nango') {
      try {
        const nangoCredentialData = JSON.parse(credentialDataString) as NangoCredentialData;

        if (mcpType === 'nango') {
          return {
            headers: {
              // For Nango MCP, authenticate with the Nango secret key
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

    if (credentialStore.type === 'keychain') {
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
        // Not JSON or invalid JSON - fall through to treat as simple token
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
    credentialStoreType: string
  ): string {
    return (
      getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: storeReference.retrievalParams,
        credentialStoreType,
      }) || context.tenantId
    );
  }

  /**
   * Get credentials from request context
   */
  async getCredentialsFromRequestContext(
    credentialContext: CredentialContext,
    headers: Record<string, string>
  ): Promise<CredentialData | null> {
    const contextConfigId = credentialContext.contextConfigId;
    const conversationId = credentialContext.conversationId;

    if (!contextConfigId || !conversationId || !this.contextResolver) {
      return null;
    }

    // Resolve the request context
    const requestContext = await this.contextResolver.resolveRequestContext(
      conversationId,
      contextConfigId
    );

    // Render any template variables in dynamic header values
    const resolvedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      resolvedHeaders[key] = TemplateEngine.render(
        value,
        { requestContext: requestContext },
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
    let credentialsFromRequestContext: CredentialData | null = null;
    // Resolve headers from request context if we have metadata to fetch context and headers to resolve
    if (context.contextConfigId && context.conversationId && headers) {
      credentialsFromRequestContext = await this.getCredentialsFromRequestContext(context, headers);
    }

    // Resolve headers from credential store if we have a store reference
    let credentialStoreHeaders: CredentialData | null = null;
    if (storeReference) {
      credentialStoreHeaders = await this.getCredentials(context, storeReference, mcpType);
    }

    // If we have no credential store headers, return the headers from the request context
    if (!credentialStoreHeaders) {
      return credentialsFromRequestContext ? credentialsFromRequestContext.headers : {};
    }

    // Combine results from both sources
    const combinedHeaders = {
      ...credentialStoreHeaders.headers,
      ...credentialStoreHeaders.metadata,
      ...credentialsFromRequestContext?.headers,
    };

    return combinedHeaders;
  }

  /**
   * Build MCP server configuration with credentials
   */
  async buildMcpServerConfig(
    context: CredentialContext,
    tool: MCPToolConfig,
    storeReference?: CredentialStoreReference
  ): Promise<McpServerConfig> {
    // Get credential headers if available
    let credentialHeaders: Record<string, string> = {};
    if (storeReference || tool.headers) {
      credentialHeaders = await this.getCredentialHeaders({
        context: context,
        mcpType: tool.mcpType,
        storeReference,
        headers: tool.headers || {},
      });
    }

    // Build base configuration
    const baseConfig = {
      type: tool.transport?.type || 'streamable_http',
      url: tool.serverUrl,
      activeTools: tool.activeTools,
    };

    // Add configuration based on transport type
    if (baseConfig.type === 'streamable_http' || baseConfig.type === 'sse') {
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
