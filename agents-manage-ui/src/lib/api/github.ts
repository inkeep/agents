'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export type GitHubAccountType = 'Organization' | 'User';
export type GitHubInstallationStatus = 'pending' | 'active' | 'suspended' | 'disconnected';

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountId: number;
  accountType: GitHubAccountType;
  status: GitHubInstallationStatus;
  repositoryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepository {
  id: string;
  installationId: string;
  repositoryId: string;
  repositoryName: string;
  repositoryFullName: string;
  private: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationDetail {
  installation: Omit<GitHubInstallation, 'repositoryCount'>;
  repositories: GitHubRepository[];
}

interface ListInstallationsResponse {
  installations: GitHubInstallation[];
}

interface InstallationDetailResponse {
  installation: GitHubInstallation;
  repositories: GitHubRepository[];
}

interface InstallUrlResponse {
  url: string;
}

interface SyncRepositoriesResponse {
  repositories: GitHubRepository[];
  syncResult: {
    added: number;
    removed: number;
    updated: number;
  };
}

interface DisconnectResponse {
  success: boolean;
}

/**
 * Fetches all GitHub App installations for a tenant.
 * By default, deleted installations are filtered out.
 */
async function $fetchGitHubInstallations(
  tenantId: string,
  includeDisconnected = true
): Promise<GitHubInstallation[]> {
  validateTenantId(tenantId);

  const queryParams = includeDisconnected ? '?includeDisconnected=true' : '';
  const response = await makeManagementApiRequest<ListInstallationsResponse>(
    `tenants/${tenantId}/github/installations${queryParams}`
  );

  return response.installations;
}
export const fetchGitHubInstallations = cache($fetchGitHubInstallations);

/**
 * Fetches details of a specific GitHub App installation including its repositories.
 */
async function $fetchGitHubInstallationDetail(
  tenantId: string,
  installationId: string
): Promise<InstallationDetail> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<InstallationDetailResponse>(
    `tenants/${tenantId}/github/installations/${installationId}`
  );

  return {
    installation: response.installation,
    repositories: response.repositories,
  };
}
export const fetchGitHubInstallationDetail = cache($fetchGitHubInstallationDetail);

/**
 * Gets the GitHub App installation URL with a signed state parameter.
 * The URL redirects the user to GitHub to install the app.
 */
export async function getGitHubInstallUrl(tenantId: string): Promise<string> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<InstallUrlResponse>(
    `tenants/${tenantId}/github/install-url`
  );

  return response.url;
}

/**
 * Manually syncs repositories for a GitHub App installation.
 * This fetches the current repository list from GitHub and updates our database.
 */
export async function syncGitHubRepositories(
  tenantId: string,
  installationId: string
): Promise<SyncRepositoriesResponse> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SyncRepositoriesResponse>(
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
export async function disconnectGitHubInstallation(
  tenantId: string,
  installationId: string
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<DisconnectResponse>(
    `tenants/${tenantId}/github/installations/${installationId}/disconnect`,
    {
      method: 'POST',
    }
  );
}

interface ReconnectResponse {
  success: boolean;
}

/**
 * Reconnects a previously disconnected GitHub App installation.
 * This sets the installation status back to "active".
 */
export async function reconnectGitHubInstallation(
  tenantId: string,
  installationId: string
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<ReconnectResponse>(
    `tenants/${tenantId}/github/installations/${installationId}/reconnect`,
    {
      method: 'POST',
    }
  );
}

export type GitHubAccessMode = 'all' | 'selected';

export interface ProjectGitHubAccess {
  mode: GitHubAccessMode;
  repositories: GitHubRepository[];
}

interface SetProjectGitHubAccessResponse {
  mode: GitHubAccessMode;
  repositoryCount: number;
}

/**
 * Fetches the GitHub repository access configuration for a project.
 * Returns mode='all' with empty repositories array when project has access to all repos.
 * Returns mode='selected' with populated repositories array when scoped.
 */
async function $getProjectGitHubAccess(
  tenantId: string,
  projectId: string
): Promise<ProjectGitHubAccess> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<ProjectGitHubAccess>(
    `tenants/${tenantId}/projects/${projectId}/github-access`
  );

  return response;
}
export const getProjectGitHubAccess = cache($getProjectGitHubAccess);

/**
 * Sets the GitHub repository access configuration for a project.
 * When mode='all', the project has access to all repositories from tenant installations.
 * When mode='selected', the project is scoped to specific repositories.
 */
export async function setProjectGitHubAccess(
  tenantId: string,
  projectId: string,
  mode: GitHubAccessMode,
  repositoryIds?: string[]
): Promise<SetProjectGitHubAccessResponse> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SetProjectGitHubAccessResponse>(
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
