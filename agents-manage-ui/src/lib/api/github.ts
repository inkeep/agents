'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export type GitHubAccountType = 'Organization' | 'User';
export type GitHubInstallationStatus = 'pending' | 'active' | 'suspended' | 'deleted';

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
  includeDeleted = false
): Promise<GitHubInstallation[]> {
  validateTenantId(tenantId);

  const queryParams = includeDeleted ? '?includeDeleted=true' : '';
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
    `tenants/${tenantId}/github/installations/${installationId}`,
    {
      method: 'DELETE',
    }
  );
}
