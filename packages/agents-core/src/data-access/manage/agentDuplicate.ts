import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import type { DuplicateAgentRequest, FullAgentSelect } from '../../types/entities';
import type { AgentScopeConfig, ProjectScopeConfig } from '../../types/utility';
import { createApiError, throwIfUniqueConstraintError } from '../../utils/error';
import { type AgentLogger, createFullAgentServerSide } from './agentFull';
import { buildCopiedAgentDefinition } from './agentPortability';
import { getAgentById, getFullAgentDefinition } from './agents';

interface DuplicateAgentParams extends DuplicateAgentRequest {
  scopes: AgentScopeConfig;
}

const defaultLogger: AgentLogger = {
  info: () => {},
  error: () => {},
};

export const duplicateFullAgentServerSide =
  (db: AgentsManageDatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (params: DuplicateAgentParams): Promise<FullAgentSelect> => {
    const {
      scopes: { tenantId, projectId, agentId },
      newAgentId,
      newAgentName,
    } = params;

    if (newAgentId === agentId) {
      throw createApiError({
        code: 'bad_request',
        message: 'New agent ID must differ from source agent ID',
      });
    }

    const sourceAgent = await getFullAgentDefinition(db)({
      scopes: { tenantId, projectId, agentId },
    });

    if (!sourceAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    const targetAgent = await getAgentById(db)({
      scopes: { tenantId, projectId, agentId: newAgentId },
    });

    if (targetAgent) {
      throw createApiError({
        code: 'conflict',
        message: `An agent with ID '${newAgentId}' already exists`,
      });
    }

    const targetScopes: ProjectScopeConfig = { tenantId, projectId };
    const duplicateAgentDefinition = buildCopiedAgentDefinition(sourceAgent, {
      newAgentId,
      newAgentName,
    });

    try {
      return (await createFullAgentServerSide(db, logger)(
        targetScopes,
        duplicateAgentDefinition
      )) as FullAgentSelect;
    } catch (error) {
      throwIfUniqueConstraintError(error, `An agent with ID '${newAgentId}' already exists`);
      throw error;
    }
  };
