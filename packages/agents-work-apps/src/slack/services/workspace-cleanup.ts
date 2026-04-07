import {
  deleteAllSlackMcpToolAccessConfigsByTenant,
  deleteAllWorkAppSlackChannelAgentConfigsByTeam,
  deleteAllWorkAppSlackUserMappingsByTeam,
  deleteWorkAppSlackWorkspaceByNangoConnectionId,
} from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import {
  clearWorkspaceConnectionCache,
  deleteWorkspaceInstallation,
  findWorkspaceConnectionByTeamId,
  revokeSlackToken,
} from '../services';

const logger = getLogger('slack-workspace-cleanup');

export interface WorkspaceCleanupResult {
  success: boolean;
  teamId: string;
  tokenRevoked: boolean;
  dbCleaned: boolean;
  nangoCleaned: boolean;
}

export async function cleanupWorkspaceInstallation({
  teamId,
  skipTokenRevocation = false,
}: {
  teamId: string;
  skipTokenRevocation?: boolean;
}): Promise<WorkspaceCleanupResult> {
  const result: WorkspaceCleanupResult = {
    success: false,
    teamId,
    tokenRevoked: false,
    dbCleaned: false,
    nangoCleaned: false,
  };

  const workspace = await findWorkspaceConnectionByTeamId(teamId);
  if (!workspace) {
    logger.warn({ teamId }, 'No workspace found for cleanup');
    clearWorkspaceConnectionCache(teamId);
    result.success = true;
    return result;
  }

  const { tenantId, botToken, connectionId } = workspace;

  if (!skipTokenRevocation && botToken) {
    result.tokenRevoked = await revokeSlackToken(botToken);
    if (result.tokenRevoked) {
      logger.info({ teamId }, 'Revoked Slack bot token during cleanup');
    } else {
      logger.warn({ teamId }, 'Failed to revoke Slack bot token, continuing with cleanup');
    }
  }

  try {
    const deletedChannelConfigs = await deleteAllWorkAppSlackChannelAgentConfigsByTeam(runDbClient)(
      tenantId,
      teamId
    );
    if (deletedChannelConfigs > 0) {
      logger.info({ teamId, deletedChannelConfigs }, 'Deleted channel configs during cleanup');
    }

    const deletedMappings = await deleteAllWorkAppSlackUserMappingsByTeam(runDbClient)(
      tenantId,
      teamId
    );
    if (deletedMappings > 0) {
      logger.info({ teamId, deletedMappings }, 'Deleted user mappings during cleanup');
    }

    const deletedMcpConfigs =
      await deleteAllSlackMcpToolAccessConfigsByTenant(runDbClient)(tenantId);
    if (deletedMcpConfigs > 0) {
      logger.info({ teamId, deletedMcpConfigs }, 'Deleted MCP tool access configs during cleanup');
    }

    const dbDeleted =
      await deleteWorkAppSlackWorkspaceByNangoConnectionId(runDbClient)(connectionId);
    if (dbDeleted) {
      logger.info({ connectionId }, 'Deleted workspace from database during cleanup');
    }

    result.dbCleaned = true;
  } catch (error) {
    logger.error({ error, teamId, connectionId }, 'Failed to clean up database records');
  }

  result.nangoCleaned = await deleteWorkspaceInstallation(connectionId);
  if (!result.nangoCleaned) {
    logger.error({ connectionId }, 'Failed to delete Nango installation during cleanup');
  }

  clearWorkspaceConnectionCache(teamId);
  logger.info({ teamId, connectionId, result }, 'Workspace cleanup completed');

  result.success = result.dbCleaned && result.nangoCleaned;
  return result;
}
