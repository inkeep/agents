'use server';

import type { AppApiCreationResponse, AppApiSelect } from '@inkeep/agents-core/client-exports';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export type App = Omit<AppApiSelect, 'lastUsedAt'> & {
  lastUsedAt?: string;
};

export type AppCreateResponse = {
  app: App;
  appSecret?: string;
};

export async function fetchApps(tenantId: string, projectId: string): Promise<ListResponse<App>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<AppApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/apps?limit=100`
  );

  return {
    ...response,
    data: response.data.map((item) => ({
      ...item,
      lastUsedAt: item.lastUsedAt ?? undefined,
    })),
  } as ListResponse<App>;
}

export async function createApp(
  tenantId: string,
  projectId: string,
  appData: Record<string, unknown>
): Promise<AppCreateResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<AppApiCreationResponse>>(
    `tenants/${tenantId}/projects/${projectId}/apps`,
    {
      method: 'POST',
      body: JSON.stringify(appData),
    }
  );

  const { app, appSecret } = response.data.data;
  return {
    app: {
      ...app,
      lastUsedAt: app.lastUsedAt ?? undefined,
    },
    appSecret,
  };
}

export async function updateApp(
  tenantId: string,
  projectId: string,
  appId: string,
  appData: Record<string, unknown>
): Promise<App> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<AppApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/apps/${appId}`,
    {
      method: 'PUT',
      body: JSON.stringify(appData),
    }
  );

  return {
    ...response.data,
    lastUsedAt: response.data.lastUsedAt ?? undefined,
  };
}

export async function deleteApp(tenantId: string, projectId: string, appId: string): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/apps/${appId}`, {
    method: 'DELETE',
  });
}
