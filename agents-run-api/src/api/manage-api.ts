import {
  apiFetch,
  FullProjectSelectWithRelationIds,
  generateInternalServiceToken,
  InternalServices,
  McpTool,
  TenantProjectAgentSubAgentParamsSchema,
  TenantProjectAgentParamsSchema,
  TenantProjectParamsSchema,
  getLogger,
  type ResolvedRef,
  type FunctionToolApiSelect,
} from '@inkeep/agents-core';
import { z } from '@hono/zod-openapi';

const logger = getLogger('manage-api-helper');

type TenantProjectAgentSubAgentParams = z.infer<typeof TenantProjectAgentSubAgentParamsSchema>;
type TenantProjectAgentParams = z.infer<typeof TenantProjectAgentParamsSchema>;
type TenantProjectParams = z.infer<typeof TenantProjectParamsSchema>;

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ManageApiConfig {
  baseUrl: string;
}

export interface GetProjectConfigParams {
  scopes: TenantProjectParams;
  ref?: string;
}

export interface GetAgentConfigParams {
  scopes: TenantProjectAgentParams;
  ref?: string;
}

export interface ResolveRefParams {
  scopes: TenantProjectParams;
  ref?: string;
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

const buildUrl = (
  baseUrl: string,
  path: string,
  params?: { ref?: string; page?: number; limit?: number }
): string => {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const url = new URL(`${normalizedBase}${path}`);
  if (params?.ref !== undefined && params.ref != 'main') {
    url.searchParams.set('ref', params.ref);
  }
  if (params?.page !== undefined) {
    url.searchParams.set('page', String(params.page));
  }
  if (params?.limit !== undefined) {
    url.searchParams.set('limit', String(params.limit));
  }
  return url.toString();
};

const getInternalServiceAuthHeaders = async (
  tenantId: string,
  projectId: string
): Promise<Record<string, string>> => {
  const token = await generateInternalServiceToken({
    serviceId: InternalServices.AGENTS_RUN_API,
    tenantId,
    projectId,
  });

  return {
    Authorization: `Bearer ${token}`,
  };
};

export const getFullProject =
  (config: ManageApiConfig) =>
  async (params: GetProjectConfigParams): Promise<FullProjectSelectWithRelationIds> => {
    const {
      scopes: { tenantId, projectId },
      ref,
    } = params;
    const path = `/tenants/${tenantId}/project-full/${projectId}/with-relation-ids`;
    const url = buildUrl(config.baseUrl, path, { ref });

    const headers = await getInternalServiceAuthHeaders(tenantId, projectId);

    const response = await apiFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new ManageApiError(
        `Failed to fetch project config: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const json = await response.json();
    return json.data as FullProjectSelectWithRelationIds;
  };

export const getResolvedRef =
  (config: ManageApiConfig) =>
  async (params: ResolveRefParams): Promise<ResolvedRef> => {
    const {
      scopes: { tenantId, projectId },
      ref,
    } = params;
    logger.info({ tenantId, projectId, ref }, 'Resolving ref');
    const path = `/tenants/${tenantId}/projects/${projectId}/refs/resolve`;
    const url = buildUrl(config.baseUrl, path, { ref });

    const headers = await getInternalServiceAuthHeaders(tenantId, projectId);

    const response = await apiFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new ManageApiError(
        `Failed to resolve ref: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const json = await response.json();
    return json.data as ResolvedRef;
  };

export interface GetMcpToolParams {
  scopes: TenantProjectParams;
  toolId: string;
  ref?: string;
  userId?: string;
}

export const getMcpTool =
  (config: ManageApiConfig) =>
  async (params: GetMcpToolParams): Promise<McpTool> => {
    const {
      scopes: { tenantId, projectId },
      toolId,
      ref,
      userId,
    } = params;
    const path = `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`;
    const url = buildUrl(config.baseUrl, path, { ref });

    const headers = await getInternalServiceAuthHeaders(tenantId, projectId);

    const response = await apiFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new ManageApiError(
        `Failed to fetch MCP tool: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const json = await response.json();
    return json.data as McpTool;
  };

export interface GetFunctionToolsForSubAgentParams {
  scopes: TenantProjectAgentSubAgentParams;
  ref?: string;
}

export const getFunctionToolsForSubAgent =
  (config: ManageApiConfig) =>
  async (params: GetFunctionToolsForSubAgentParams): Promise<FunctionToolApiSelect[]> => {
    const {
      scopes: { tenantId, projectId, agentId, subAgentId },
      ref,
    } = params;
    const path = `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-function-tools/sub-agent/${subAgentId}`;

    const headers = await getInternalServiceAuthHeaders(tenantId, projectId);
    const allItems: FunctionToolApiSelect[] = [];
    let currentPage = 1;
    const pageSize = 100;

    while (true) {
      const url = buildUrl(config.baseUrl, path, { ref, page: currentPage, limit: pageSize });

      const response = await apiFetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new ManageApiError(
          `Failed to fetch function tools for sub-agent: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const json = (await response.json()) as PaginatedResponse<FunctionToolApiSelect>;
      allItems.push(...json.data);

      if (currentPage >= json.pagination.pages) {
        break;
      }
      currentPage++;
    }

    return allItems;
  };
