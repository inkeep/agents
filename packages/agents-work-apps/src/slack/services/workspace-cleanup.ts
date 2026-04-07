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

  const steps: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: 'channel_configs',
      run: () => deleteAllWorkAppSlackChannelAgentConfigsByTeam(runDbClient)(tenantId, teamId),
    },
    {
      name: 'user_mappings',
      run: () => deleteAllWorkAppSlackUserMappingsByTeam(runDbClient)(tenantId, teamId),
    },
    {
      name: 'mcp_configs',
      run: () => deleteAllSlackMcpToolAccessConfigsByTenant(runDbClient)(tenantId),
    },
    {
      name: 'workspace_row',
      run: () => deleteWorkAppSlackWorkspaceByNangoConnectionId(runDbClient)(connectionId),
    },
    {
      name: 'nango_connection',
      run: () => deleteWorkspaceInstallation(connectionId),
    },
  ];

  const failures: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failures.push(step.name);
      logger.error({ error, teamId, connectionId, step: step.name }, 'Cleanup step failed');
    }
  }

  result.dbCleaned = !failures.some((f) => f !== 'nango_connection');
  result.nangoCleaned = !failures.includes('nango_connection');

  clearWorkspaceConnectionCache(teamId);

  result.success = failures.length === 0;
  if (failures.length > 0) {
    logger.error({ teamId, connectionId, failures }, 'Workspace cleanup completed with failures');
  } else {
    logger.info({ teamId, connectionId }, 'Workspace cleanup completed');
  }

  return result;
}
