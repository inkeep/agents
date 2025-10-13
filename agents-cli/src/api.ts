// Import shared API client from agents-core
import {
  type AgentApiInsert,
  type AgentApiSelect,
  apiFetch,
  OPENAI_MODELS,
} from '@inkeep/agents-core';

abstract class BaseApiClient {
  protected apiUrl: string;
  protected tenantId: string | undefined;
  protected projectId: string;
  protected apiKey: string | undefined;

  protected constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string
  ) {
    this.apiUrl = apiUrl;
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.apiKey = apiKey;
  }

  protected checkTenantId(): string {
    if (!this.tenantId) {
      throw new Error('No tenant ID configured. Please run: inkeep init');
    }
    return this.tenantId;
  }

  /**
   * Wrapper around fetch that automatically includes Authorization header if API key is present
   */
  protected async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Build headers with Authorization if API key is present
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add Authorization header if API key is provided
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return apiFetch(url, {
      ...options,
      headers,
    });
  }

  getTenantId(): string | undefined {
    return this.tenantId;
  }

  getProjectId(): string {
    return this.projectId;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}

export class ManagementApiClient extends BaseApiClient {
  private constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string
  ) {
    super(apiUrl, tenantId, projectId, apiKey);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string
  ): Promise<ManagementApiClient> {
    // Load config from file
    const { validateConfiguration } = await import('./utils/config.js');
    const config = await validateConfiguration(configPath);

    // Allow overrides from parameters
    const resolvedApiUrl = apiUrl || config.agentsManageApiUrl;
    const tenantId = tenantIdOverride || config.tenantId;
    const projectId = projectIdOverride || '';

    return new ManagementApiClient(resolvedApiUrl, tenantId, projectId, config.agentsManageApiKey);
  }

  async listAgents(): Promise<AgentApiSelect[]> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/tenants/${tenantId}/projects/${projectId}/agents`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  async getAgent(agentId: string): Promise<AgentApiSelect | null> {
    // Since there's no dedicated GET endpoint for agents,
    // we check if the agent exists in the CRUD endpoint
    const agents = await this.listAgents();
    const agent = agents.find((g) => g.id === agentId);

    // If found in CRUD, return it as a valid agent
    // The agent is usable for chat even without a dedicated GET endpoint
    return agent || null;
  }

  async pushAgent(agentDefinition: AgentApiInsert): Promise<any> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    const agentId = agentDefinition.id;
    if (!agentId) {
      throw new Error('Agent must have an id property');
    }

    // Try to update first using PUT, if it doesn't exist, it will create it
    const response = await this.authenticatedFetch(
      `${this.apiUrl}/tenants/${tenantId}/projects/${projectId}/agents/${agentId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...agentDefinition,
          tenantId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to push agent: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  async getFullProject(projectId: string): Promise<any> {
    const tenantId = this.checkTenantId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/tenants/${tenantId}/project-full/${projectId}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Project "${projectId}" not found`);
      }
      if (response.status === 401) {
        throw new Error('Unauthorized - check your API key');
      }
      throw new Error(`Failed to fetch project: ${response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.data;
  }
}

export class ExecutionApiClient extends BaseApiClient {
  private constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string
  ) {
    super(apiUrl, tenantId, projectId, apiKey);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string
  ): Promise<ExecutionApiClient> {
    // Load config from file
    const { validateConfiguration } = await import('./utils/config.js');
    const config = await validateConfiguration(configPath);

    // Allow overrides from parameters
    const resolvedApiUrl = apiUrl || config.agentsRunApiUrl;
    const tenantId = tenantIdOverride || config.tenantId;
    const projectId = projectIdOverride || '';

    return new ExecutionApiClient(resolvedApiUrl, tenantId, projectId, config.agentsRunApiKey);
  }

  async chatCompletion(
    agentId: string,
    messages: any[],
    conversationId?: string,
    emitOperations?: boolean
  ): Promise<ReadableStream<Uint8Array> | string> {
    const response = await this.authenticatedFetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'x-inkeep-tenant-id': this.tenantId || 'test-tenant-id',
        'x-inkeep-project-id': this.projectId,
        'x-inkeep-agent-id': agentId,
        ...(emitOperations && { 'x-emit-operations': 'true' }),
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.GPT_4_1_MINI_20250414, // Required but will be overridden by graph config
        messages,
        conversationId,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.statusText}\n${errorText}`);
    }

    // Check if response is streaming
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      if (!response.body) {
        throw new Error('No response body for streaming request');
      }
      return response.body;
    } else {
      // Non-streaming response
      const data = await response.json();
      return data.choices?.[0]?.message?.content || data.result || '';
    }
  }
}
