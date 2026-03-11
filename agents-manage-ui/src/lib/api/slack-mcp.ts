'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export type SlackMcpChannelAccessMode = 'all' | 'selected';

export interface SlackMcpAccessConfig {
  channelAccessMode: SlackMcpChannelAccessMode;
  dmEnabled: boolean;
  channelIds: string[];
}

async function $getSlackMcpToolAccess(
  tenantId: string,
  projectId: string,
  toolId: string
): Promise<SlackMcpAccessConfig> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<SlackMcpAccessConfig>(
    `tenants/${tenantId}/projects/${projectId}/tools/${toolId}/slack-access`
  );
}
export const getSlackMcpToolAccess = cache($getSlackMcpToolAccess);

export async function setSlackMcpToolAccess(
  tenantId: string,
  projectId: string,
  toolId: string,
  config: {
    channelAccessMode: SlackMcpChannelAccessMode;
    dmEnabled: boolean;
    channelIds?: string[];
  }
): Promise<SlackMcpAccessConfig> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<SlackMcpAccessConfig>(
    `tenants/${tenantId}/projects/${projectId}/tools/${toolId}/slack-access`,
    {
      method: 'PUT',
      body: JSON.stringify({
        channelAccessMode: config.channelAccessMode,
        dmEnabled: config.dmEnabled,
        channelIds: config.channelAccessMode === 'selected' ? (config.channelIds ?? []) : [],
      }),
    }
  );
}
