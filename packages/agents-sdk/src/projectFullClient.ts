/**
 * Client-side functions for interacting with the Full Project API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import { apiFetch, type FullProjectDefinition, getLogger } from '@inkeep/agents-core';

export function getAuthError(error?: string): string {
  let errorMessage = 'Authentication failed - check your API key configuration\n\n';
  errorMessage += 'Common issues:\n';
  errorMessage += '  • Missing or invalid API key in inkeep.config.ts\n';
  errorMessage += '  • API key does not have access to this tenant/project\n';
  errorMessage +=
    '  • For local development, ensure INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET is set\n';
  if (error) {
    errorMessage += `\nServer response: ${error}`;
  }
  return errorMessage;
}

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

  const url = `${apiUrl}/manage/tenants/${tenantId}/project-full`;

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
    const { status, statusText } = response;
    const error =
      parseError(errorText, status) ?? `Failed to create project: ${status} ${statusText}`;
    logger.error({ status, error }, 'Failed to create project via API');

    throw new Error(error);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info({ projectId: projectData.id }, 'Successfully created project via API');

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

  const url = `${apiUrl}/manage/tenants/${tenantId}/project-full/${projectId}`;

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
    const { status, statusText } = response;
    const error =
      parseError(errorText, status) ?? `Failed to update project: ${status} ${statusText}`;
    logger.error({ status, error }, 'Failed to update project via API');
    throw new Error(error);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info({ projectId }, 'Successfully updated project via API');

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

  const url = `${apiUrl}/manage/tenants/${tenantId}/project-full/${projectId}`;

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
    const { status, statusText } = response;
    const error = parseError(errorText, status) ?? `Failed to get project: ${status} ${statusText}`;
    logger.error({ status, error }, 'Failed to get project via API');

    throw new Error(error);
  }

  const result = (await response.json()) as { data: FullProjectDefinition };

  logger.info({ projectId }, 'Successfully retrieved project via API');

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

  const url = `${apiUrl}/manage/tenants/${tenantId}/project-full/${projectId}`;

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
    const { status, statusText } = response;
    const errorText = await response.text();
    const error =
      parseError(errorText, status) ?? `Failed to delete project: ${status} ${statusText}`;
    logger.error({ status, error }, 'Failed to delete project via API');

    throw new Error(error);
  }

  logger.info({ projectId }, 'Successfully deleted project via API');
}

export function parseError(errorText: string, status: number): string | undefined {
  let result: string | undefined;
  try {
    const { detail, error } = JSON.parse(errorText);
    result = detail ?? error?.message ?? error;
  } catch {
    // Use the text as-is if not JSON
    if (errorText) {
      result = errorText;
    }
  }
  if (status === 401 || status === 403) {
    result = getAuthError(result);
  }
  return result;
}
