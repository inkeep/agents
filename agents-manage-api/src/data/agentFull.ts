import { type FullAgentDefinition, validateAndTypeAgentData } from '@inkeep/agents-core';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('agentFull');

/**
 * Client-side implementation of createFullAgent that makes HTTP requests to the API endpoint.
 * This function should be used by client code instead of directly accessing the data layer.
 */
export const createFullAgent = async (
  tenantId: string,
  agentData: FullAgentDefinition
): Promise<FullAgentDefinition> => {
  logger.info(
    {
      tenantId,
      agentId: agentData.id,
      subAgentCount: Object.keys((agentData as any).subAgents || {}).length,
    },
    'Creating full agent via API endpoint'
  );

  try {
    const baseUrl = env.AGENTS_MANAGE_API_URL;
    const endpoint = `${baseUrl}/tenants/${tenantId}/agent`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    logger.info(
      {
        tenantId,
        agentId: agentData.id,
        status: response.status,
      },
      'Full agent created successfully via API'
    );

    return result.data;
  } catch (error) {
    logger.error(
      {
        tenantId,
        agentId: agentData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to create full agent via API'
    );
    throw error;
  }
};

/**
 * Client-side implementation of updateFullAgent that makes HTTP requests to the API endpoint.
 */
export const updateFullAgent = async (
  tenantId: string,
  agentId: string,
  agentData: FullAgentDefinition
): Promise<FullAgentDefinition> => {
  const typed = validateAndTypeAgentData(agentData);

  if (agentId !== typed.id) {
    throw new Error(`Agent ID mismatch: expected ${agentId}, got ${typed.id}`);
  }

  logger.info(
    {
      tenantId,
      agentId,
      subAgentCount: Object.keys((agentData as any).subAgents || {}).length,
    },
    'Updating full agent via API endpoint'
  );

  try {
    const baseUrl = env.AGENTS_MANAGE_API_URL;
    const endpoint = `${baseUrl}/tenants/${tenantId}/agent/${agentId}`;

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    logger.info(
      {
        tenantId,
        agentId,
        status: response.status,
      },
      'Full agent updated successfully via API'
    );

    return result.data;
  } catch (error) {
    logger.error(
      {
        tenantId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to update full agent via API'
    );
    throw error;
  }
};
