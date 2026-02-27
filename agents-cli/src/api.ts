// Import shared API client from agents-core
import {
  type AgentApiInsert,
  type AgentApiSelect,
  apiFetch,
  type FullProjectSelectResponse,
  OPENAI_MODELS,
} from '@inkeep/agents-core';
import type { z } from 'zod';

type FullProjectResponse = z.infer<typeof FullProjectSelectResponse>;

abstract class BaseApiClient {
  protected apiUrl: string;
  protected tenantId: string | undefined;
  protected projectId: string;
  protected apiKey: string | undefined;
  protected isCI: boolean;

  protected constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string,
    isCI: boolean = false
  ) {
    this.apiUrl = apiUrl;
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.apiKey = apiKey;
    this.isCI = isCI;
  }

  protected checkTenantId(): string {
    if (!this.tenantId) {
      throw new Error('No tenant ID configured. Please run: inkeep init');
    }
    return this.tenantId;
  }

  /**
   * Wrapper around fetch that automatically includes auth header
   * Uses X-API-Key for CI mode, Authorization Bearer for interactive mode
   */
  protected async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Build headers with auth if API key is present
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add auth header based on mode
    if (this.apiKey) {
      if (this.isCI) {
        // CI mode: use X-API-Key header for tenant-level API keys
        headers['X-API-Key'] = this.apiKey;
      } else {
        // Interactive mode: use Bearer token for user session tokens
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
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

  getIsCI(): boolean {
    return this.isCI;
  }
}

export class ManagementApiClient extends BaseApiClient {
  private constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string,
    isCI: boolean = false
  ) {
    super(apiUrl, tenantId, projectId, apiKey, isCI);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string,
    isCI?: boolean,
    apiKeyOverride?: string
  ): Promise<ManagementApiClient> {
    // Load config from file
    const { validateConfiguration } = await import('./utils/config.js');
    const config = await validateConfiguration(configPath);

    // Allow overrides from parameters
    const resolvedApiUrl = apiUrl || config.agentsApiUrl;
    const tenantId = tenantIdOverride || config.tenantId;
    const projectId = projectIdOverride || '';

    // Use explicit API key override if provided (e.g., from profile credentials)
    const apiKey = apiKeyOverride || config.agentsApiKey;

    return new ManagementApiClient(resolvedApiUrl, tenantId, projectId, apiKey, isCI ?? false);
  }

  async listAgents(): Promise<AgentApiSelect[]> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/agents?limit=100`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list agents: ${response.statusText}. ${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/agents`
      );
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
      `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}`,
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

  async getFullProject(projectId: string): Promise<FullProjectResponse> {
    const tenantId = this.checkTenantId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/manage/tenants/${tenantId}/project-full/${projectId}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Project "${projectId}" not found`);
      }
      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text().catch(() => '');
        let errorMessage = 'Authentication failed - check your API key configuration\n\n';
        errorMessage += 'Common issues:\n';
        errorMessage += '  • Missing or invalid API key in inkeep.config.ts\n';
        errorMessage += '  • API key does not have access to this tenant/project\n';
        errorMessage +=
          '  • For local development, ensure INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET is set\n';
        if (errorText) {
          errorMessage += `\nServer response: ${errorText}`;
        }
        throw new Error(errorMessage);
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch project: ${response.statusText}${errorText ? `\n${errorText}` : ''}`
      );
    }

    const responseData = await response.json();
    return responseData.data;
  }

  /**
   * List all projects for the current tenant
   * @param page - Page number (1-based)
   * @param limit - Number of results per page (max 100)
   * @returns List of projects with pagination info
   */
  async listProjects(
    page: number = 1,
    limit: number = 100
  ): Promise<{ data: any[]; pagination: { page: number; limit: number; total: number } }> {
    const tenantId = this.checkTenantId();

    const response = await this.authenticatedFetch(
      `${this.apiUrl}/manage/tenants/${tenantId}/projects?page=${page}&limit=${limit}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text().catch(() => '');
        let errorMessage = 'Authentication failed - check your API key configuration\n\n';
        errorMessage += 'Common issues:\n';
        errorMessage += '  • Missing or invalid API key in inkeep.config.ts\n';
        errorMessage += '  • API key does not have access to this tenant\n';
        if (errorText) {
          errorMessage += `\nServer response: ${errorText}`;
        }
        throw new Error(errorMessage);
      }
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Failed to list projects: ${response.statusText}${errorText ? `\n${errorText}` : ''}`
      );
    }

    const responseData = await response.json();
    return responseData;
  }

  /**
   * List all projects for the current tenant (fetches all pages)
   * @returns Array of all projects
   */
  async listAllProjects(): Promise<any[]> {
    const allProjects: any[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const result = await this.listProjects(page, limit);
      allProjects.push(...result.data);

      // Check if we've fetched all projects
      if (result.data.length < limit || allProjects.length >= result.pagination.total) {
        break;
      }
      page++;
    }

    return allProjects;
  }

  async getDataComponent(componentId: string): Promise<{
    id: string;
    name: string;
    render: { component: string; mockData: Record<string, unknown> } | null;
  } | null> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();
    const response = await this.authenticatedFetch(
      `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/data-components/${componentId}`,
      { method: 'GET' }
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch data component: ${response.statusText}${err ? `\n${err}` : ''}`
      );
    }
    const json = await response.json();
    return json.data ?? null;
  }

  async listDataComponents(): Promise<
    {
      id: string;
      name: string;
      render: { component: string; mockData: Record<string, unknown> } | null;
    }[]
  > {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();
    const all: {
      id: string;
      name: string;
      render: { component: string; mockData: Record<string, unknown> } | null;
    }[] = [];
    let page = 1;
    const limit = 100;
    let result: { data: any[]; pagination: { total: number } };
    do {
      const response = await this.authenticatedFetch(
        `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/data-components?page=${page}&limit=${limit}`,
        { method: 'GET' }
      );
      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(
          `Failed to list data components: ${response.statusText}${err ? `\n${err}` : ''}`
        );
      }
      result = await response.json();
      all.push(...(result.data || []));
      page++;
    } while (result.data?.length === limit && all.length < (result.pagination?.total ?? 0));
    return all;
  }

  async getArtifactComponent(componentId: string): Promise<{
    id: string;
    name: string;
    render: { component: string; mockData: Record<string, unknown> } | null;
  } | null> {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();
    const response = await this.authenticatedFetch(
      `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/artifact-components/${componentId}`,
      { method: 'GET' }
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch artifact component: ${response.statusText}${err ? `\n${err}` : ''}`
      );
    }
    const json = await response.json();
    return json.data ?? null;
  }

  async listArtifactComponents(): Promise<
    {
      id: string;
      name: string;
      render: { component: string; mockData: Record<string, unknown> } | null;
    }[]
  > {
    const tenantId = this.checkTenantId();
    const projectId = this.getProjectId();
    const all: {
      id: string;
      name: string;
      render: { component: string; mockData: Record<string, unknown> } | null;
    }[] = [];
    let page = 1;
    const limit = 100;
    let result: { data: any[]; pagination: { total: number } };
    do {
      const response = await this.authenticatedFetch(
        `${this.apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/artifact-components?page=${page}&limit=${limit}`,
        { method: 'GET' }
      );
      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(
          `Failed to list artifact components: ${response.statusText}${err ? `\n${err}` : ''}`
        );
      }
      result = await response.json();
      all.push(...(result.data || []));
      page++;
    } while (result.data?.length === limit && all.length < (result.pagination?.total ?? 0));
    return all;
  }
}

export class ExecutionApiClient extends BaseApiClient {
  private constructor(
    apiUrl: string,
    tenantId: string | undefined,
    projectId: string,
    apiKey?: string,
    isCI: boolean = false
  ) {
    super(apiUrl, tenantId, projectId, apiKey, isCI);
  }

  static async create(
    apiUrl?: string,
    configPath?: string,
    tenantIdOverride?: string,
    projectIdOverride?: string,
    isCI?: boolean
  ): Promise<ExecutionApiClient> {
    // Load config from file
    const { validateConfiguration } = await import('./utils/config.js');
    const config = await validateConfiguration(configPath);

    // Allow overrides from parameters
    const resolvedApiUrl = apiUrl || config.agentsApiUrl;
    const tenantId = tenantIdOverride || config.tenantId;
    const projectId = projectIdOverride || '';

    return new ExecutionApiClient(
      resolvedApiUrl,
      tenantId,
      projectId,
      config.agentsApiKey,
      isCI ?? false
    );
  }

  async chatCompletion(
    agentId: string,
    messages: any[],
    conversationId?: string,
    emitOperations?: boolean
  ): Promise<ReadableStream<Uint8Array> | string> {
    const response = await this.authenticatedFetch(`${this.apiUrl}/run/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'x-inkeep-tenant-id': this.tenantId || 'test-tenant-id',
        'x-inkeep-project-id': this.projectId,
        'x-inkeep-agent-id': agentId,
        ...(emitOperations && { 'x-emit-operations': 'true' }),
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.GPT_4_1_MINI, // Required but will be overridden by graph config
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
    }
    // Non-streaming response
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.result || '';
  }
}
