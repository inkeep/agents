/**
 * Client-side functions for interacting with the Full Graph API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import type { FullGraphDefinition } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('graphFullClient');

/**
 * Serialize error response to human-readable string
 */
function serializeErrorResponse(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    // If error has code and message, format them nicely
    if (error.code && error.message) {
      return `${error.code}: ${error.message}`;
    }
    // Otherwise, stringify the whole object
    return JSON.stringify(error, null, 2);
  }

  return String(error);
}

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
        errorMessage = serializeErrorResponse(errorJson.error);
      } else if (errorJson.message) {
        errorMessage = serializeErrorResponse(errorJson.message);
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    let parsedError: any;
    try {
      const errorJson = JSON.parse(errorText);
      parsedError = errorJson.error || errorJson;
    } catch {
      parsedError = errorText;
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
        rawError: parsedError,
      },
      'Failed to create graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

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
        errorMessage = serializeErrorResponse(errorJson.error);
      } else if (errorJson.message) {
        errorMessage = serializeErrorResponse(errorJson.message);
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    let parsedError: any;
    try {
      const errorJson = JSON.parse(errorText);
      parsedError = errorJson.error || errorJson;
    } catch {
      parsedError = errorText;
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
        rawError: parsedError,
      },
      'Failed to update graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

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

  if (!response.ok) {
    if (response.status === 404) {
      logger.info(
        {
          graphId,
        },
        'Graph not found'
      );
      return null;
    }

    const errorText = await response.text();
    let errorMessage = `Failed to get graph: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = serializeErrorResponse(errorJson.error);
      } else if (errorJson.message) {
        errorMessage = serializeErrorResponse(errorJson.message);
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    let parsedError: any;
    try {
      const errorJson = JSON.parse(errorText);
      parsedError = errorJson.error || errorJson;
    } catch {
      parsedError = errorText;
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
        rawError: parsedError,
      },
      'Failed to get graph via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullGraphDefinition };

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
): Promise<void> {
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

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to delete graph: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = serializeErrorResponse(errorJson.error);
      } else if (errorJson.message) {
        errorMessage = serializeErrorResponse(errorJson.message);
      }
    } catch {
      // Use the text as-is if not JSON
      if (errorText) {
        errorMessage = errorText;
      }
    }

    let parsedError: any;
    try {
      const errorJson = JSON.parse(errorText);
      parsedError = errorJson.error || errorJson;
    } catch {
      parsedError = errorText;
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
        rawError: parsedError,
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
}
