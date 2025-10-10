/**
 * Client-side functions for interacting with the Full Project API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import { apiFetch, type FullProjectDefinition, getLogger } from '@inkeep/agents-core';

const logger = getLogger('projectFullClient');

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
 * Create a full project via HTTP API
 */
export async function createFullProjectViaAPI(
  tenantId: string,
  apiUrl: string,
  projectData: FullProjectDefinition,
  apiKey?: string
): Promise<FullProjectDefinition> {
  logger.info(
    {
      tenantId,
      projectId: projectData.id,
      apiUrl,
    },
    'Creating full project via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/project-full`;

  // Build headers with optional Authorization
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(projectData),
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
        projectId: projectData.id,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create project: ${response.status} ${response.statusText}`;

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
      'Failed to create project via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info(
    {
      projectId: projectData.id,
    },
    'Successfully created project via API'
  );

  return result.data;
}

/**
 * Update a full project via HTTP API (upsert behavior)
 */
export async function updateFullProjectViaAPI(
  tenantId: string,
  apiUrl: string,
  projectId: string,
  projectData: FullProjectDefinition,
  apiKey?: string
): Promise<FullProjectDefinition> {
  logger.info(
    {
      tenantId,
      projectId,
      apiUrl,
    },
    'Updating full project via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/project-full/${projectId}`;

  // Build headers with optional Authorization
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(projectData),
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
        projectId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to update project: ${response.status} ${response.statusText}`;

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
      'Failed to update project via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info(
    {
      projectId,
    },
    'Successfully updated project via API'
  );

  return result.data;
}

/**
 * Get a full project via HTTP API
 */
export async function getFullProjectViaAPI(
  tenantId: string,
  apiUrl: string,
  projectId: string,
  apiKey?: string
): Promise<FullProjectDefinition | null> {
  logger.info(
    {
      tenantId,
      projectId,
      apiUrl,
    },
    'Getting full project via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/project-full/${projectId}`;

  // Build headers with optional Authorization
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await apiFetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 404) {
      logger.info(
        {
          projectId,
        },
        'Project not found'
      );
      return null;
    }

    const errorText = await response.text();
    let errorMessage = `Failed to get project: ${response.status} ${response.statusText}`;

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
      'Failed to get project via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info(
    {
      projectId,
    },
    'Successfully retrieved project via API'
  );

  return result.data;
}

/**
 * Delete a full project via HTTP API
 */
export async function deleteFullProjectViaAPI(
  tenantId: string,
  apiUrl: string,
  projectId: string,
  apiKey?: string
): Promise<void> {
  logger.info(
    {
      tenantId,
      projectId,
      apiUrl,
    },
    'Deleting full project via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/project-full/${projectId}`;

  // Build headers with optional Authorization
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await apiFetch(url, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to delete project: ${response.status} ${response.statusText}`;

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
      'Failed to delete project via API'
    );

    throw new Error(errorMessage);
  }

  logger.info(
    {
      projectId,
    },
    'Successfully deleted project via API'
  );
}
