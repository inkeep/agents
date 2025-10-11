/**
 * Client-side functions for interacting with the Full Agent API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import type { FullGraphDefinition } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('agentFullClient');

/**
 * Create a full agent via HTTP API
 */
export async function createFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  graphData: FullGraphDefinition
): Promise<FullGraphDefinition> {
  logger.info(
    {
      tenantId,
      projectId,
      agentId: graphData.id,
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
    body: JSON.stringify(graphData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create agent: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to create agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

  logger.info(
    {
      agentId: graphData.id,
    },
    'Successfully created agent via API'
  );

  return result.data;
}

/**
 * Update a full agent via HTTP API (upsert behavior)
 */
export async function updateFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentId: string,
  graphData: FullGraphDefinition
): Promise<FullGraphDefinition> {
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
    body: JSON.stringify(graphData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to update agent: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to update agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

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
export async function getFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  agentId: string
): Promise<FullGraphDefinition | null> {
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
    let errorMessage = `Failed to get agent: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to get agent via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

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
export async function deleteFullGraphViaAPI(
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
    let errorMessage = `Failed to delete agent: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

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
