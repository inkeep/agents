/**
 * Client-side functions for interacting with the Full Project API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import { apiFetch, type FullProjectDefinition, getLogger } from '@inkeep/agents-core';

const logger = getLogger('projectFullClient');

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
    const errorMessage =
      parseError(errorText) ??
      `Failed to create project: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
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
    const errorMessage =
      parseError(errorText) ??
      `Failed to update project: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
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
    const errorMessage =
      parseError(errorText) ?? `Failed to get project: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
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
    const errorMessage =
      parseError(errorText) ??
      `Failed to delete project: ${response.status} ${response.statusText}`;

    logger.error(
      {
        status: response.status,
        error: errorMessage,
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

export function parseError(errorText: string): string | undefined {
  let result: string | undefined;
  try {
    const errorJson = JSON.parse(errorText);
    if (errorJson.error) {
      const { error } = errorJson;
      result = error?.message ?? error;
    }
  } catch {
    // Use the text as-is if not JSON
    if (errorText) {
      result = errorText;
    }
  }
  return result;
}
