/**
 * Client-side functions for interacting with the Full Graph API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import type { FullGraphDefinition } from '@inkeep/agents-core';
import { getLogger } from '../logger';

const logger = getLogger('graphFullClient');

/**
 * Create a full graph via HTTP API
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
      graphId: graphData.id,
      apiUrl,
    },
    'Creating full graph via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/graph`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create graph: ${response.status} ${response.statusText}`;

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
      'Failed to create graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = await response.json();

  logger.info(
    {
      graphId: graphData.id,
    },
    'Successfully created graph via API'
  );

  return result.data;
}

/**
 * Update a full graph via HTTP API (upsert behavior)
 */
export async function updateFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  graphId: string,
  graphData: FullGraphDefinition
): Promise<FullGraphDefinition> {
  logger.info(
    {
      tenantId,
      projectId,
      graphId,
      apiUrl,
    },
    'Updating full graph via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/graph/${graphId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to update graph: ${response.status} ${response.statusText}`;

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
      'Failed to update graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = await response.json();

  logger.info(
    {
      graphId,
    },
    'Successfully updated graph via API'
  );

  return result.data;
}

/**
 * Get a full graph via HTTP API
 */
export async function getFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  graphId: string
): Promise<FullGraphDefinition | null> {
  logger.info(
    {
      tenantId,
      projectId,
      graphId,
      apiUrl,
    },
    'Getting full graph via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/graph/${graphId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to get graph: ${response.status} ${response.statusText}`;

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
      'Failed to get graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = await response.json();

  logger.info(
    {
      graphId,
    },
    'Successfully retrieved graph via API'
  );

  return result.data;
}

/**
 * Delete a full graph via HTTP API
 */
export async function deleteFullGraphViaAPI(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  graphId: string
): Promise<boolean> {
  logger.info(
    {
      tenantId,
      projectId,
      graphId,
      apiUrl,
    },
    'Deleting full graph via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/projects/${projectId}/graph/${graphId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to delete graph: ${response.status} ${response.statusText}`;

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
      'Failed to delete graph via API'
    );

    throw new Error(errorMessage);
  }

  logger.info(
    {
      graphId,
    },
    'Successfully deleted graph via API'
  );

  return true;
}
