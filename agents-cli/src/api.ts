// Import shared API client from agents-core
import { type AgentGraphApiInsert, type AgentGraphApiSelect, apiFetch } from '@inkeep/agents-core';

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

  async listGraphs(): Promise<AgentGraphApiSelect[]> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/tenants/${tenantId}/projects/${projectId}/agent-graphs`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list graphs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  async getGraph(graphId: string): Promise<AgentGraphApiSelect | null> {
    // Since there's no dedicated GET endpoint for graphs,
    // we check if the graph exists in the CRUD endpoint
    const graphs = await this.listGraphs();
    const graph = graphs.find((g) => g.id === graphId);

    // If found in CRUD, return it as a valid graph
    // The graph is usable for chat even without a dedicated GET endpoint
    return graph || null;
  }

  async pushGraph(graphDefinition: AgentGraphApiInsert): Promise<any> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    const graphId = graphDefinition.id;
    if (!graphId) {
      throw new Error('Graph must have an id property');
    }

    // Try to update first using PUT, if it doesn't exist, it will create it
    const response = await this.authenticatedFetch(
      `${this.apiUrl}/tenants/${tenantId}/projects/${projectId}/graph/${graphId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...graphDefinition,
          tenantId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to push graph: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Fetch full project data including all graphs, tools, and components
   */
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
    graphId: string,
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
        'x-inkeep-graph-id': graphId,
        ...(emitOperations && { 'x-emit-operations': 'true' }),
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Required but will be overridden by graph config
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
