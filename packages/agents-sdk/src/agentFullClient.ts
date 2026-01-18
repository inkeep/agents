/**
 * Client-side functions for interacting with the Full Agent API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import type { FullAgentDefinition } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import { parseError } from './projectFullClient';

const logger = getLogger('agentFullClient');

/**
 * Create a full agent via HTTP API
 */
export async function createFullAgentViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentData: FullAgentDefinition
): Promise<FullAgentDefinition> {
  logger.info(
    {
      tenantId,
      projectId,
      agentId: agentData.id,
      apiUrl,
    },
    'Creating full agent via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/agent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage =
      parseError(errorText) ?? `Failed to create agent: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to create agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullAgentDefinition };

  logger.info(
    {
      agentId: agentData.id,
    },
    'Successfully created agent via API'
  );

  return result.data;
}

/**
 * Update a full agent via HTTP API (upsert behavior)
 */
export async function updateFullAgentViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentId: string,
  agentData: FullAgentDefinition
): Promise<FullAgentDefinition> {
  logger.info(
    {
      tenantId,
      projectId,
      agentId,
      apiUrl,
    },
    'Updating full agent via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/agent/${agentId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage =
      parseError(errorText) ?? `Failed to update agent: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to update agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullAgentDefinition };

  logger.info(
    {
      agentId,
    },
    'Successfully updated agent via API'
  );

  return result.data;
}

/**
 * Get a full agent via HTTP API
 */
export async function getFullAgentViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentId: string
): Promise<FullAgentDefinition | null> {
  logger.info(
    {
      tenantId,
      projectId,
      agentId,
      apiUrl,
    },
    'Getting full agent via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/agent/${agentId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      logger.info(
        {
          agentId,
        },
        'Agent not found'
      );
      return null;
    }

    const errorText = await response.text();
    const errorMessage =
      parseError(errorText) ?? `Failed to get agent: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to get agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullAgentDefinition };

  logger.info(
    {
      agentId,
    },
    'Successfully retrieved agent via API'
  );

  return result.data;
}

/**
 * Delete a full agent via HTTP API
 */
export async function deleteFullAgentViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentId: string
): Promise<void> {
  logger.info(
    {
      tenantId,
      projectId,
      agentId,
      apiUrl,
    },
    'Deleting full agent via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/agent/${agentId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMessage =
      parseError(errorText) ?? `Failed to delete agent: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to delete agent via API'
    );

    throw new Error(errorMessage);
  }

  logger.info(
    {
      agentId,
    },
    'Successfully deleted agent via API'
  );
}
