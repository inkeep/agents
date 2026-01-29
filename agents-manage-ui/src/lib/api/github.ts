'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export type WorkAppGitHubAccountType = 'Organization' | 'User';
export type WorkAppGitHubInstallationStatus = 'pending' | 'active' | 'suspended' | 'disconnected';

export interface WorkAppGitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountId: number;
  accountType: WorkAppGitHubAccountType;
  status: WorkAppGitHubInstallationStatus;
  repositoryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkAppGitHubRepository {
  id: string;
  installationId: string;
  repositoryId: string;
  repositoryName: string;
  repositoryFullName: string;
  private: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkAppGitHubInstallationDetail {
  installation: Omit<WorkAppGitHubInstallation, 'repositoryCount'>;
  repositories: WorkAppGitHubRepository[];
}

interface ListWorkAppGitHubInstallationsResponse {
  installations: WorkAppGitHubInstallation[];
}

interface WorkAppGitHubInstallationDetailResponse {
  installation: WorkAppGitHubInstallation;
  repositories: WorkAppGitHubRepository[];
}

interface WorkAppGitHubInstallUrlResponse {
  url: string;
}

interface WorkAppGitHubSyncRepositoriesResponse {
  repositories: WorkAppGitHubRepository[];
  syncResult: {
    added: number;
    removed: number;
    updated: number;
  };
}

interface WorkAppGitHubDisconnectResponse {
  success: boolean;
}

/**
 * Fetches all GitHub App installations for a tenant.
 * By default, deleted installations are filtered out.
 */
async function $fetchWorkAppGitHubInstallations(
  tenantId: string,
  includeDisconnected = true
): Promise<WorkAppGitHubInstallation[]> {
  validateTenantId(tenantId);

  const queryParams = includeDisconnected ? '?includeDisconnected=true' : '';
  const response = await makeManagementApiRequest<ListWorkAppGitHubInstallationsResponse>(
    `tenants/${tenantId}/github/installations${queryParams}`
  );

  return response.installations;
}
export const fetchWorkAppGitHubInstallations = cache($fetchWorkAppGitHubInstallations);

/**
 * Fetches details of a specific GitHub App installation including its repositories.
 */
async function $fetchWorkAppGitHubInstallationDetail(
  tenantId: string,
  installationId: string
): Promise<WorkAppGitHubInstallationDetail> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<WorkAppGitHubInstallationDetailResponse>(
    `tenants/${tenantId}/github/installations/${installationId}`
  );

  return {
    installation: response.installation,
    repositories: response.repositories,
  };
}
export const fetchWorkAppGitHubInstallationDetail = cache($fetchWorkAppGitHubInstallationDetail);

/**
 * Gets the GitHub App installation URL with a signed state parameter.
 * The URL redirects the user to GitHub to install the app.
 */
export async function getWorkAppGitHubInstallUrl(tenantId: string): Promise<string> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<WorkAppGitHubInstallUrlResponse>(
    `tenants/${tenantId}/github/install-url`
  );

  return response.url;
}

/**
 * Manually syncs repositories for a GitHub App installation.
 * This fetches the current repository list from GitHub and updates our database.
 */
export async function syncWorkAppGitHubRepositories(
  tenantId: string,
  installationId: string
): Promise<WorkAppGitHubSyncRepositoriesResponse> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<WorkAppGitHubSyncRepositoriesResponse>(
    `tenants/${tenantId}/github/installations/${installationId}/sync`,
    {
      method: 'POST',
    }
  );

  return response;
}

/**
 * Disconnects a GitHub App installation from the tenant.
 * This soft deletes the installation and removes all project repository access.
 * Note: This does NOT uninstall the GitHub App from GitHub.
 */
export async function disconnectWorkAppGitHubInstallation(
  tenantId: string,
  installationId: string
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<WorkAppGitHubDisconnectResponse>(
    `tenants/${tenantId}/github/installations/${installationId}/disconnect`,
    {
      method: 'POST',
    }
  );
}

interface WorkAppGitHubReconnectResponse {
  success: boolean;
}

/**
 * Reconnects a previously disconnected GitHub App installation.
 * This sets the installation status back to "active".
 */
export async function reconnectWorkAppGitHubInstallation(
  tenantId: string,
  installationId: string
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<WorkAppGitHubReconnectResponse>(
    `tenants/${tenantId}/github/installations/${installationId}/reconnect`,
    {
      method: 'POST',
    }
  );
}

export type WorkAppGitHubAccessMode = 'all' | 'selected';

export interface WorkAppGitHubProjectAccess {
  mode: WorkAppGitHubAccessMode;
  repositories: WorkAppGitHubRepository[];
}

interface SetProjectWorkAppGitHubAccessResponse {
  mode: WorkAppGitHubAccessMode;
  repositoryCount: number;
}

/**
 * Fetches the GitHub repository access configuration for a project.
 * Returns mode='all' with empty repositories array when project has access to all repos.
 * Returns mode='selected' with populated repositories array when scoped.
 */
async function $getProjectWorkAppGitHubAccess(
  tenantId: string,
  projectId: string
): Promise<WorkAppGitHubProjectAccess> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<WorkAppGitHubProjectAccess>(
    `tenants/${tenantId}/projects/${projectId}/github-access`
  );

  return response;
}
export const getProjectWorkAppGitHubAccess = cache($getProjectWorkAppGitHubAccess);

/**
 * Sets the GitHub repository access configuration for a project.
 * When mode='all', the project has access to all repositories from tenant installations.
 * When mode='selected', the project is scoped to specific repositories.
 */
export async function setProjectWorkAppGitHubAccess(
  tenantId: string,
  projectId: string,
  mode: WorkAppGitHubAccessMode,
  repositoryIds?: string[]
): Promise<SetProjectWorkAppGitHubAccessResponse> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SetProjectWorkAppGitHubAccessResponse>(
    `tenants/${tenantId}/projects/${projectId}/github-access`,
    {
      method: 'PUT',
      body: JSON.stringify({
        mode,
        repositoryIds: mode === 'selected' ? repositoryIds : undefined,
      }),
    }
  );

  return response;
}

// MCP Tool GitHub Access

export interface McpToolGitHubRepository extends WorkAppGitHubRepository {
  installationAccountLogin: string;
}

export interface McpToolWorkAppGitHubAccess {
  mode: WorkAppGitHubAccessMode;
  repositories: McpToolGitHubRepository[];
}

interface SetMcpToolWorkAppGitHubAccessResponse {
  mode: WorkAppGitHubAccessMode;
  repositoryCount: number;
}

/**
 * Fetches the GitHub repository access configuration for an MCP tool.
 * Returns mode='all' with empty repositories array when tool has access to all project repos.
 * Returns mode='selected' with populated repositories array when scoped to specific repos.
 */
async function $getMcpToolWorkAppGitHubAccess(
  tenantId: string,
  projectId: string,
  toolId: string
): Promise<McpToolWorkAppGitHubAccess> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<McpToolWorkAppGitHubAccess>(
    `tenants/${tenantId}/projects/${projectId}/tools/${toolId}/github-access`
  );

  return response;
}
export const getMcpToolWorkAppGitHubAccess = cache($getMcpToolWorkAppGitHubAccess);

/**
 * Sets the GitHub repository access configuration for an MCP tool.
 * When mode='all', the tool has access to all repositories the project can access.
 * When mode='selected', the tool is scoped to specific repositories.
 */
export async function setMcpToolWorkAppGitHubAccess(
  tenantId: string,
  projectId: string,
  toolId: string,
  mode: WorkAppGitHubAccessMode,
  repositoryIds?: string[]
): Promise<SetMcpToolWorkAppGitHubAccessResponse> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SetMcpToolWorkAppGitHubAccessResponse>(
    `tenants/${tenantId}/projects/${projectId}/tools/${toolId}/github-access`,
    {
      method: 'PUT',
      body: JSON.stringify({
        mode,
        repositoryIds: mode === 'selected' ? repositoryIds : undefined,
      }),
    }
  );

  return response;
}
