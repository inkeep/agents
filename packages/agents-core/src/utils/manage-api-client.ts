import { apiFetch } from '../api-client/base-client';
import type {
  EvaluationJobConfigEvaluatorRelationSelect,
  EvaluationJobConfigSelect,
  EvaluatorSelect,
  FullAgentDefinition,
  FullProjectSelectWithRelationIds,
  FunctionToolApiSelect,
  McpTool,
} from '../types/entities';
import type { ResolvedRef } from '../validation/dolt-schemas';
import { generateInternalServiceToken, type InternalServiceId } from './internal-service-auth';
import { getLogger } from './logger';

const logger = getLogger('manage-api-client');

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}


export class ManageApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'ManageApiError';
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }
}

export abstract class BaseApiClient {
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

export type ManagementApiClientAuth =
  | { mode: 'internalService'; internalServiceName: InternalServiceId }
  | { mode: 'apiKey'; apiKey: string; isCI?: boolean };

export interface ManagementApiClientConfig {
  apiUrl: string;
  tenantId: string;
  projectId: string;
  auth: ManagementApiClientAuth;
  ref?: string;
}

export class ManagementApiClient extends BaseApiClient {
  private internalServiceName?: InternalServiceId;
  private ref?: string;

  constructor(config: ManagementApiClientConfig) {
    const apiKey = config.auth.mode === 'apiKey' ? config.auth.apiKey : undefined;
    const isCI = config.auth.mode === 'apiKey' ? (config.auth.isCI ?? false) : false;

    super(config.apiUrl, config.tenantId, config.projectId, apiKey, isCI);

    if (config.auth.mode === 'internalService') {
      this.internalServiceName = config.auth.internalServiceName;
    }
    this.ref = config.ref;
  }

  private buildUrl(path: string, params?: { page?: number; limit?: number }): string {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = new URL(`${normalizedBase}${path}`);
    if (this.ref !== undefined && this.ref !== 'main') {
      url.searchParams.set('ref', this.ref);
    }
    if (params?.page !== undefined) {
      url.searchParams.set('page', String(params.page));
    }
    if (params?.limit !== undefined) {
      url.searchParams.set('limit', String(params.limit));
    }
    return url.toString();
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const tenantId = this.checkTenantId();

    if (this.internalServiceName) {
      // Internal service mode: generate JWT token
      const token = await generateInternalServiceToken({
        serviceId: this.internalServiceName,
        tenantId,
        projectId: this.projectId,
      });
      return { Authorization: `Bearer ${token}` };
    }

    // API key mode
    if (this.apiKey) {
      if (this.isCI) {
        return { 'X-API-Key': this.apiKey };
      }
      return { Authorization: `Bearer ${this.apiKey}` };
    }

    return {};
  }

  private async makeGetRequest<T>(path: string, errorContext: string): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    const response = await apiFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new ManageApiError(
        `${errorContext}: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const json = await response.json();
    return json.data as T;
  }

  private async makePostRequest<T>(path: string, body: unknown, errorContext: string): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    const response = await apiFetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new ManageApiError(
        `${errorContext}: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const json = await response.json();
    return json.data as T;
  }

  private async makePaginatedGetRequest<T>(
    path: string,
    errorContext: string,
    pageSize: number = 100
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = 1;
    const headers = await this.getAuthHeaders();

    while (true) {
      const url = this.buildUrl(path, { page: currentPage, limit: pageSize });

      const response = await apiFetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new ManageApiError(
          `${errorContext}: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const json = (await response.json()) as PaginatedResponse<T>;
      allItems.push(...json.data);

      if (currentPage >= json.pagination.pages) {
        break;
      }
      currentPage++;
    }

    return allItems;
  }

  async getFullProject(): Promise<FullProjectSelectWithRelationIds> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/project-full/${this.projectId}/with-relation-ids`;
    return this.makeGetRequest<FullProjectSelectWithRelationIds>(path, 'Failed to fetch project config');
  }

  async getResolvedRef(): Promise<ResolvedRef> {
    const tenantId = this.checkTenantId();
    logger.info({ tenantId, projectId: this.projectId }, 'Resolving ref');
    const path = `/tenants/${tenantId}/projects/${this.projectId}/refs/resolve`;
    return this.makeGetRequest<ResolvedRef>(path, 'Failed to resolve ref');
  }

  async getFullAgent(agentId: string): Promise<FullAgentDefinition | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/agent-full/${agentId}`;

    try {
      return await this.makeGetRequest<FullAgentDefinition>(path, 'Failed to fetch full agent');
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getMcpTool(toolId: string): Promise<McpTool> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/tools/${toolId}`;
    return this.makeGetRequest<McpTool>(path, 'Failed to fetch MCP tool');
  }

  async getFunctionToolsForSubAgent(
    agentId: string,
    subAgentId: string,
  ): Promise<FunctionToolApiSelect[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/agents/${agentId}/sub-agent-function-tools/sub-agent/${subAgentId}`;
    return this.makePaginatedGetRequest<FunctionToolApiSelect>(
      path,
      'Failed to fetch function tools for sub-agent',
    );
  }

  async getEvaluationJobConfigById(
    evaluationJobConfigId: string
  ): Promise<EvaluationJobConfigSelect | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-job-configs/${evaluationJobConfigId}`;

    try {
      return await this.makeGetRequest<EvaluationJobConfigSelect>(
        path,
        'Failed to fetch evaluation job config'
      );
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getEvaluationJobConfigEvaluatorRelations(
    evaluationJobConfigId: string
  ): Promise<EvaluationJobConfigEvaluatorRelationSelect[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-job-configs/${evaluationJobConfigId}/evaluator-relations`;
    return this.makePaginatedGetRequest<EvaluationJobConfigEvaluatorRelationSelect>(
      path,
      'Failed to fetch evaluation job config evaluator relations'
    );
  }

  async getEvaluatorById(evaluatorId: string): Promise<EvaluatorSelect | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluators/${evaluatorId}`;

    try {
      return await this.makeGetRequest<EvaluatorSelect>(path, 'Failed to fetch evaluator');
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getEvaluatorsByIds(evaluatorIds: string[]): Promise<EvaluatorSelect[]> {
    if (evaluatorIds.length === 0) {
      return [];
    }
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluators/batch`;
    return this.makePostRequest<EvaluatorSelect[]>(path, { evaluatorIds }, 'Failed to fetch evaluators batch');
  }
}

