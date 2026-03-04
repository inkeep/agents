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
  protected constructor(
    protected apiUrl: string,
    protected tenantId: string | undefined,
    protected projectId: string,
    protected apiKey?: string,
    protected isCI = false
  ) {}

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
      ...(options.headers as Record<string, string>),
      // cookie:
      //   'unify_visitor_id=26062925-607c-4ed2-ba41-f92cb750d7dd; IndrX2M0NVhQcmVaXzhwZ1VWUFlOQ0x1dlozZ1ZjQW5BNHRWSExHdzFaSEJzX3VuaWZ5X3Zpc2l0b3JfaWQi=IjI2MDYyOTI1LTYwN2MtNGVkMi1iYTQxLWY5MmNiNzUwZDdkZCI=; _gcl_au=1.1.1042220851.1767710965; unify_session_id=d60fc9f3-6bca-4026-a47b-9a96d8f4ccf8; IndrX2M0NVhQcmVaXzhwZ1VWUFlOQ0x1dlozZ1ZjQW5BNHRWSExHdzFaSEJzX3VuaWZ5X3Nlc3Npb25faWQi=ImQ2MGZjOWYzLTZiY2EtNDAyNi1hNDdiLTlhOTZkOGY0Y2NmOCI=; ph_phc_tmyI0UQGFnLiRkVseDcCpO2vJmB1fuq8UI8XB2tmCU4_posthog=%7B%22%24device_id%22%3A%22019995f3-ad01-7fcb-a899-2d46bd0e422d%22%2C%22distinct_id%22%3A%22019995f3-ad01-7fcb-a899-2d46bd0e422d%22%2C%22%24sesid%22%3A%5B1770398878166%2C%22019c33ff-09d5-7966-ac65-64104d6afb51%22%2C1770398878165%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22%24direct%22%2C%22u%22%3A%22https%3A%2F%2Finkeep.com%2F%22%7D%7D; __Secure-better-auth.session_token=iou4dbIEvjytcHyXATVBmh1LioKjwh1m.Q4U%2BKZGRZPA%2F8iv1Y5jBRma5F2tgsSIvQnB4qqrmI%2BY%3D; __Secure-better-auth.session_data=eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXhwaXJlc0F0IjoiMjAyNi0wMy0wOVQyMToyNTozNy4xOTRaIiwidG9rZW4iOiJpb3U0ZGJJRXZqeXRjSHlYQVRWQm1oMUxpb0tqd2gxbSIsImNyZWF0ZWRBdCI6IjIwMjYtMDEtMjlUMTE6Mjc6MTkuNTQyWiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMDJUMjE6MjU6MzcuMTk0WiIsImlwQWRkcmVzcyI6IjE0LjI0MC4xNi4xMDgiLCJ1c2VyQWdlbnQiOiJNb3ppbGxhLzUuMCAoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTMzLjAuMC4wIFNhZmFyaS81MzcuMzYiLCJ1c2VySWQiOiJpQ3hRTGxGS0ZkMGpCdDJFbjF3Z2hUS3RjWGFWeXNoMSIsImFjdGl2ZU9yZ2FuaXphdGlvbklkIjoiZGVmYXVsdCIsImlkIjoic3BDOXIyYkhyM2E5ZXc5dTBiVVBXdlJaTU91c1lTamEifSwidXNlciI6eyJuYW1lIjoiRGltaXRyaSBQb3N0b2xvdiIsImVtYWlsIjoiZGltYUBpbmtlZXAuY29tIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwiaW1hZ2UiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NKdDk1RG9NWW9xUTh0UTdnZExJZkd6b19UaGd4UGlnSzc0bkNhc3kxWnFqV3N6bWc9czk2LWMiLCJjcmVhdGVkQXQiOiIyMDI1LTEyLTE4VDE2OjM3OjE0Ljc3NFoiLCJ1cGRhdGVkQXQiOiIyMDI1LTEyLTE4VDE2OjM3OjE0Ljc3NFoiLCJpZCI6ImlDeFFMbEZLRmQwakJ0MkVuMXdnaFRLdGNYYVZ5c2gxIn0sInVwZGF0ZWRBdCI6MTc3MjUyMzA1NTcxMiwidmVyc2lvbiI6IjEifSwiZXhwaXJlc0F0IjoxNzcyNTIzMDg1NzEyLCJzaWduYXR1cmUiOiJNQnFDd2ZGN0VHSzJnMjItbDJsdjJja1NPMGtUSXEtT01yMDdYNTNmV2RBIn0; ph_phc_iGjhUK9kbBnMSAQEKltsxhN35W3cKAxL1I7f9hYhGL7_posthog=%7B%22%24device_id%22%3A%22019b326b-768c-7d8a-86a3-2ba47fe06d14%22%2C%22distinct_id%22%3A%22iCxQLlFKFd0jBt2En1wghTKtcXaVysh1%22%2C%22%24sesid%22%3A%5B1772523062919%2C%22019cb279-5124-78a4-b633-39272aa85f84%22%2C1772520821026%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22%24direct%22%2C%22u%22%3A%22https%3A%2F%2Finkeep.com%2F%22%7D%7D',
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

type ConstructorParams = [
  apiUrl: string,
  tenantId: string | undefined,
  projectId: string,
  apiKey?: string,
  isCI?: boolean,
];

export class ManagementApiClient extends BaseApiClient {
  private constructor(...args: ConstructorParams) {
    super(...args);
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

  async getFullProject(projectId: string): Promise<FullProjectResponse['data']> {
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
    console.log();
    console.dir(responseData.data, { depth: null });
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
  private constructor(...args: ConstructorParams) {
    super(...args);
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
