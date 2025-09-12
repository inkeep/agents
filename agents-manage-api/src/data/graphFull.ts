import { type FullGraphDefinition, validateAndTypeGraphData } from '@inkeep/agents-core';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('graphFull');

/**
 * Client-side implementation of createFullGraph that makes HTTP requests to the API endpoint.
 * This function should be used by client code instead of directly accessing the data layer.
 */
export const createFullGraph = async (
  tenantId: string,
  graphData: FullGraphDefinition
): Promise<FullGraphDefinition> => {
  logger.info(
    {
      tenantId,
      graphId: graphData.id,
      agentCount: Object.keys((graphData as any).agents || {}).length,
    },
    'Creating full graph via API endpoint'
  );

  try {
    const baseUrl = env.AGENTS_MANAGE_API_URL;
    const endpoint = `${baseUrl}/tenants/${tenantId}/crud/graph`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    logger.info(
      {
        tenantId,
        graphId: graphData.id,
        status: response.status,
      },
      'Full graph created successfully via API'
    );

    return result.data;
  } catch (error) {
    logger.error(
      {
        tenantId,
        graphId: graphData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to create full graph via API'
    );
    throw error;
  }
};

/**
 * Client-side implementation of updateFullGraph that makes HTTP requests to the API endpoint.
 */
export const updateFullGraph = async (
  tenantId: string,
  graphId: string,
  graphData: FullGraphDefinition
): Promise<FullGraphDefinition> => {
  const typed = validateAndTypeGraphData(graphData);

  // Validate that the graphId matches the data.id
  if (graphId !== typed.id) {
    throw new Error(`Graph ID mismatch: expected ${graphId}, got ${typed.id}`);
  }

  logger.info(
    {
      tenantId,
      graphId,
      agentCount: Object.keys((graphData as any).agents || {}).length,
    },
    'Updating full graph via API endpoint'
  );

  try {
    const baseUrl = env.AGENTS_MANAGE_API_URL;
    const endpoint = `${baseUrl}/tenants/${tenantId}/crud/graph/${graphId}`;

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    logger.info(
      {
        tenantId,
        graphId,
        status: response.status,
      },
      'Full graph updated successfully via API'
    );

    return result.data;
  } catch (error) {
    logger.error(
      {
        tenantId,
        graphId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to update full graph via API'
    );
    throw error;
  }
};
