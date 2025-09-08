import {
  getExecutionApiUrl,
  getManagementApiUrl,
  getProjectId,
  getTenantId,
} from './utils/config.js';

abstract class BaseApiClient {
  protected apiUrl: string;
  protected tenantId: string | undefined;
  protected projectId: string;

  protected constructor(apiUrl: string, tenantId: string | undefined, projectId: string) {
    this.apiUrl = apiUrl;
    this.tenantId = tenantId;
    this.projectId = projectId;
  }

  protected checkTenantId(): string {
    if (!this.tenantId) {
      throw new Error('No tenant ID configured. Please run: inkeep init');
    }
    return this.tenantId;
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
  private constructor(apiUrl: string, tenantId: string | undefined, projectId: string) {
    super(apiUrl, tenantId, projectId);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string
  ): Promise<ManagementApiClient> {
    const resolvedApiUrl = await getManagementApiUrl(apiUrl, configPath);
    const tenantId = tenantIdOverride || (await getTenantId(configPath));
    const projectId = projectIdOverride || (await getProjectId(configPath));
    return new ManagementApiClient(resolvedApiUrl, tenantId, projectId);
  }

  async listGraphs(): Promise<any[]> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();
    const response = await fetch(
      `${this.apiUrl}/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INKEEP_AGENTS_MANAGE_API_SECRET && {
            Authorization: `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_SECRET}`,
          }),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list graphs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  async getGraph(graphId: string): Promise<any> {
    // Since there's no dedicated GET endpoint for graphs,
    // we check if the graph exists in the CRUD endpoint
    const graphs = await this.listGraphs();
    const graph = graphs.find((g) => g.id === graphId);

    // If found in CRUD, return it as a valid graph
    // The graph is usable for chat even without a dedicated GET endpoint
    return graph || null;
  }

  async pushGraph(graphDefinition: any): Promise<any> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    // Ensure the graph has the correct tenant ID
    graphDefinition.tenantId = tenantId;

    const graphId = graphDefinition.id;
    if (!graphId) {
      throw new Error('Graph must have an id property');
    }

    // Try to update first using PUT, if it doesn't exist, it will create it
    const response = await fetch(
      `${this.apiUrl}/tenants/${tenantId}/crud/projects/${projectId}/graph/${graphId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INKEEP_AGENTS_MANAGE_API_SECRET && {
            Authorization: `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_SECRET}`,
          }),
        },
        body: JSON.stringify(graphDefinition),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to push graph: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }
}

export class ExecutionApiClient extends BaseApiClient {
  private constructor(apiUrl: string, tenantId: string | undefined, projectId: string) {
    super(apiUrl, tenantId, projectId);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string
  ): Promise<ExecutionApiClient> {
    const resolvedApiUrl = await getExecutionApiUrl(apiUrl, configPath);
    const tenantId = tenantIdOverride || (await getTenantId(configPath));
    const projectId = projectIdOverride || (await getProjectId(configPath));
    return new ExecutionApiClient(resolvedApiUrl, tenantId, projectId);
  }

  async chatCompletion(
    graphId: string,
    messages: any[],
    conversationId?: string
  ): Promise<ReadableStream<Uint8Array> | string> {
    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(process.env.INKEEP_AGENTS_RUN_BYPASS_SECRET && {
          Authorization: `Bearer ${process.env.INKEEP_AGENTS_RUN_BYPASS_SECRET}`,
        }),
        'x-inkeep-tenant-id': this.tenantId || 'test-tenant-id',
        'x-inkeep-project-id': this.projectId,
        'x-inkeep-graph-id': graphId,
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
