/**
 * Client-side functions for interacting with the Full Project API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('projectFullClient');

/**
 * Create a full project via HTTP API
 */
export async function createFullProjectViaAPI(
  tenantId: string,
  apiUrl: string,
  projectData: FullProjectDefinition
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
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create project: ${response.status} ${response.statusText}`;

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
  projectData: FullProjectDefinition
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
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to update project: ${response.status} ${response.statusText}`;

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
  projectId: string
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
  projectId: string
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
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to delete project: ${response.status} ${response.statusText}`;

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
