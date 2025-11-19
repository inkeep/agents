/**
 * Tool Approval Server Actions
 *
 * ⚠️ SECURITY: This file uses 'use server' directive - all functions execute server-side only.
 *
 * Client components should ONLY import fetchToolApprovalDiff() - never import the internal
 * utility functions directly from client code.
 *
 * The internal functions are exported for testing purposes only.
 */
'use server';

import { makeManagementApiRequest } from '../api/api-config';
import type { ActionResult } from './types';

interface ToolMetadata {
  resource: string;
  action: string;
  entity: string;
}

interface GetEntityParams {
  toolName: string;
  input: Record<string, any>;
  tenantId: string;
  projectId: string;
}

interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

interface FetchToolApprovalDiffParams {
  toolName: string;
  input: Record<string, any>;
  tenantId: string;
  projectId: string;
}

function parseToolName(toolName: string): ToolMetadata {
  const parts = toolName.split('-');

  const actions = ['create', 'update', 'delete', 'get', 'list'];
  const actionIndex = parts.findIndex((part) => actions.includes(part));

  if (actionIndex === -1) {
    throw new Error(`Unable to parse tool name: ${toolName}`);
  }

  return {
    resource: parts.slice(0, actionIndex).join('-'),
    action: parts[actionIndex],
    entity: parts.slice(actionIndex + 1).join('-'),
  };
}

function extractEntityId(input: Record<string, any>, metadata: ToolMetadata): string | null {
  const { entity, resource } = metadata;

  const request = input.request || input;

  const specificIdFields = ['id', `${entity}Id`, entity.replace(/-/g, '') + 'Id'];

  for (const field of specificIdFields) {
    if (request[field]) {
      return request[field];
    }
  }

  const commonIdFields = ['agentId', 'subAgentId', 'toolId'];

  if (resource === 'projects' && request.id) {
    return request.id;
  }

  for (const field of commonIdFields) {
    if (request[field]) {
      return request[field];
    }
  }

  return null;
}

function pluralizeResource(resource: string): string {
  const pluralMappings: Record<string, string> = {
    agent: 'agents',
    'sub-agent': 'sub-agents',
    credential: 'credentials',
    function: 'functions',
  };

  if (pluralMappings[resource]) {
    return pluralMappings[resource];
  }

  if (!resource.endsWith('s')) {
    return `${resource}s`;
  }

  return resource;
}

function buildApiPath(
  metadata: ToolMetadata,
  tenantId: string,
  projectId: string,
  entityId: string,
  additionalParams?: { agentId?: string }
): string {
  const { resource } = metadata;

  const pathMappings: Record<
    string,
    (tid: string, pid: string, eid: string, params?: any) => string
  > = {
    projects: (tid, _pid, eid) => `tenants/${tid}/projects/${eid}`,
    agent: (tid, pid, eid) => `tenants/${tid}/projects/${pid}/agent/${eid}`,
    'sub-agent': (tid, pid, eid, params) => {
      if (!params?.agentId) {
        console.warn('sub-agent path requires agentId but none provided');
        return `tenants/${tid}/projects/${pid}/agents/MISSING_AGENT_ID/sub-agents/${eid}`;
      }
      return `tenants/${tid}/projects/${pid}/agents/${params.agentId}/sub-agents/${eid}`;
    },
  };

  if (pathMappings[resource]) {
    return pathMappings[resource](tenantId, projectId, entityId, additionalParams);
  }

  const pluralEntity = pluralizeResource(resource);

  if (resource.includes('-relations')) {
    return `tenants/${tenantId}/projects/${projectId}/${pluralEntity}/${entityId}`;
  }

  return `tenants/${tenantId}/projects/${projectId}/${pluralEntity}/${entityId}`;
}

async function fetchCurrentEntityState(
  params: GetEntityParams
): Promise<Record<string, any> | null> {
  const { toolName, input, tenantId, projectId } = params;

  if (
    !toolName.includes('update') &&
    !toolName.includes('create') &&
    !toolName.includes('delete')
  ) {
    return null;
  }

  const metadata = parseToolName(toolName);

  if (metadata.action === 'create') {
    return {};
  }

  const entityId = extractEntityId(input, metadata);

  if (!entityId) {
    console.warn(`Could not extract entity ID from input for tool: ${toolName}`);
    return null;
  }

  try {
    // Extract agentId for sub-agents (they're nested under agents)
    const request = input.request || input;
    const agentId = request.agentId;

    const apiPath = buildApiPath(metadata, tenantId, projectId, entityId, { agentId });
    const response = await makeManagementApiRequest<any>(apiPath, {
      method: 'GET',
    });

    const currentState = response.data || response;
    return currentState;
  } catch (error) {
    console.error(`Failed to fetch current state for ${toolName}:`, error);
    return null;
  }
}

function extractFieldsToUpdate(input: Record<string, any>): Record<string, any> {
  const request = input.request || input;
  return request.body || {};
}

function computeDiff(
  currentState: Record<string, any> | null,
  newValues: Record<string, any>
): Array<{ field: string; oldValue: any; newValue: any }> {
  const diffs: Array<{ field: string; oldValue: any; newValue: any }> = [];

  for (const [field, newValue] of Object.entries(newValues)) {
    const oldValue = currentState?.[field] ?? '';

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({
        field,
        oldValue,
        newValue,
      });
    }
  }

  return diffs;
}

export async function fetchToolApprovalDiff(
  params: FetchToolApprovalDiffParams
): Promise<ActionResult<FieldDiff[]> & { entityData?: Record<string, any> }> {
  try {
    const { toolName, input, tenantId, projectId } = params;

    const currentState = await fetchCurrentEntityState({
      toolName,
      input,
      tenantId,
      projectId,
    });

    if (toolName.includes('delete') && currentState) {
      return {
        success: true,
        data: [],
        entityData: currentState,
      };
    }

    const newValues = extractFieldsToUpdate(input);
    const diffs = computeDiff(currentState, newValues);

    return {
      success: true,
      data: diffs,
    };
  } catch (error) {
    console.error('Failed to fetch tool approval diff:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch entity state',
      code: 'fetch_failed',
    };
  }
}

/**
 * ⚠️ TESTING EXPORTS ONLY
 *
 * These functions are exported for testing purposes only.
 * Do NOT import these directly from client components - they will still execute server-side,
 * but importing them from client code breaks the architectural boundary.
 *
 * Client components should only import: fetchToolApprovalDiff()
 */
export {
  fetchCurrentEntityState,
  extractFieldsToUpdate,
  computeDiff,
  parseToolName,
  extractEntityId,
  buildApiPath,
  pluralizeResource,
};
export type { ToolMetadata, GetEntityParams, FieldDiff };
