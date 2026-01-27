/**
 * Slack API Client
 *
 * A reusable client for making authenticated API calls from Slack commands.
 * Uses the user's session token stored in Nango to authenticate requests.
 *
 * Usage:
 * ```typescript
 * const client = new SlackApiClient({
 *   sessionToken: connection.inkeepSessionToken,
 *   tenantId: connection.tenantId,
 * });
 *
 * const projects = await client.listProjects();
 * const agents = await client.listAgents(projectId);
 * ```
 */

import { env } from '../../../../env';
import { getLogger } from '../../../../logger';

const logger = getLogger('slack-api-client');

export class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'SlackApiError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

export interface SlackApiClientConfig {
  sessionToken: string;
  tenantId: string;
  apiUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Project {
  id: string;
  name: string | null;
  description: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string | null;
  description: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export class SlackApiClient {
  private readonly sessionToken: string;
  private readonly tenantId: string;
  private readonly apiUrl: string;

  constructor(config: SlackApiClientConfig) {
    this.sessionToken = config.sessionToken;
    this.tenantId = config.tenantId;
    this.apiUrl = config.apiUrl || env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.sessionToken}`,
    };
  }

  private buildUrl(path: string, params?: Record<string, string | number>): string {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = new URL(`${normalizedBase}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number>;
    }
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);

    logger.debug({ method, path, tenantId: this.tenantId }, 'Making API request');

    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error(
        { status: response.status, path, tenantId: this.tenantId },
        'API request failed'
      );

      if (response.status === 401) {
        throw new SlackApiError(
          'Session expired. Please re-link your account from the dashboard.',
          response.status,
          errorBody
        );
      }

      throw new SlackApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return response.json() as Promise<T>;
  }

  async listProjects(options?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Project>> {
    return this.request<PaginatedResponse<Project>>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects`,
      { params: { page: options?.page || 1, limit: options?.limit || 100 } }
    );
  }

  async getProject(projectId: string): Promise<{ data: Project }> {
    return this.request<{ data: Project }>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}`
    );
  }

  async listAgents(
    projectId: string,
    options?: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<Agent>> {
    return this.request<PaginatedResponse<Agent>>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/agents`,
      { params: { page: options?.page || 1, limit: options?.limit || 100 } }
    );
  }

  async getAgent(projectId: string, agentId: string): Promise<{ data: Agent }> {
    return this.request<{ data: Agent }>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/agents/${agentId}`
    );
  }

  getTenantId(): string {
    return this.tenantId;
  }
}

/**
 * Factory function to create a SlackApiClient from a Nango connection
 */
export function createSlackApiClient(connection: {
  inkeepSessionToken?: string;
  inkeepSessionExpiresAt?: string;
  tenantId?: string;
}): SlackApiClient {
  if (!connection.inkeepSessionToken) {
    throw new SlackApiError(
      'Session expired. Please re-link your account from the dashboard.',
      401
    );
  }

  if (connection.inkeepSessionExpiresAt) {
    const expiresAt = new Date(connection.inkeepSessionExpiresAt);
    if (expiresAt < new Date()) {
      throw new SlackApiError(
        'Session expired. Please re-link your account from the dashboard.',
        401
      );
    }
  }

  return new SlackApiClient({
    sessionToken: connection.inkeepSessionToken,
    tenantId: connection.tenantId || 'default',
  });
}
