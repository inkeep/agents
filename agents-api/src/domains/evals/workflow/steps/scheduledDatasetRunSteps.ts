import {
  advanceScheduledTriggerNextRunAt,
  canUseProjectStrict,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getDatasetRunConfigEvaluatorRelations,
  getProjectScopedRef,
  getScheduledTriggerById,
  resolveRef,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { executeDatasetRun } from '../../services/datasetRun';

const logger = getLogger('workflow-scheduled-dataset-run-steps');

function deriveDeterministicDatasetRunId(
  scheduledTriggerId: string,
  scheduledFor: string,
  runAsUserId?: string
): string {
  if (runAsUserId) {
    return `dsr_${scheduledTriggerId}_${runAsUserId}_${scheduledFor}`;
  }
  return `dsr_${scheduledTriggerId}_${scheduledFor}`;
}

export async function checkDatasetRunTriggerEnabledStep(params: {
  tenantId: string;
  projectId: string;
  datasetRunConfigId: string;
  scheduledTriggerId: string;
}) {
  'use step';

  const trigger = await getScheduledTriggerById(runDbClient)({
    scopes: { tenantId: params.tenantId, projectId: params.projectId },
    scheduledTriggerId: params.scheduledTriggerId,
  });

  if (!trigger || !trigger.enabled) {
    const reason = !trigger ? 'deleted' : 'disabled';
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason },
      'Scheduled dataset run trigger workflow stopping'
    );
    return {
      shouldContinue: false as const,
      reason: reason as 'deleted' | 'disabled',
      trigger: null,
    };
  }

  return {
    shouldContinue: true as const,
    trigger,
  };
}

export async function disableDatasetRunTriggerStep(params: {
  tenantId: string;
  projectId: string;
  scheduledTriggerId: string;
}) {
  'use step';

  await advanceScheduledTriggerNextRunAt(runDbClient)({
    scopes: { tenantId: params.tenantId, projectId: params.projectId },
    scheduledTriggerId: params.scheduledTriggerId,
    nextRunAt: null,
    enabled: false,
  });
}

export async function executeDatasetRunStep(params: {
  tenantId: string;
  projectId: string;
  scheduledTriggerId: string;
  datasetRunConfigId: string;
  staggerDelayMs?: number;
  scheduledFor: string;
  ref: string;
  runAsUserId?: string;
}): Promise<{
  success: boolean;
  datasetRunId?: string;
  error?: string;
  configDeleted?: boolean;
  configMisconfigured?: boolean;
}> {
  'use step';

  const {
    tenantId,
    projectId,
    scheduledTriggerId,
    datasetRunConfigId,
    staggerDelayMs,
    scheduledFor,
    ref: triggerRef,
    runAsUserId,
  } = params;

  if (runAsUserId) {
    try {
      const canUse = await canUseProjectStrict({
        userId: runAsUserId,
        tenantId,
        projectId,
      });
      if (!canUse) {
        logger.warn({ runAsUserId }, 'User no longer has access to project');
        return {
          success: false,
          error: `User ${runAsUserId} no longer has 'use' permission on project ${projectId}.`,
        };
      }
    } catch (err) {
      logger.error({ runAsUserId, error: err }, 'Failed to check user project access');
      return {
        success: false,
        error: `Permission check failed for user ${runAsUserId}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const projectScopedRef = getProjectScopedRef(tenantId, projectId, triggerRef);
  let resolvedRef: Awaited<ReturnType<ReturnType<typeof resolveRef>>> = null;
  try {
    resolvedRef = await resolveRef(manageDbClient)(projectScopedRef);
  } catch (err) {
    logger.warn({ err, scheduledTriggerId }, 'Failed to resolve ref for dataset run');
    return {
      success: false,
      error: `Failed to resolve ref: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!resolvedRef) {
    return {
      success: false,
      error: `Failed to resolve ref for project ${projectId}`,
    };
  }

  const datasetRunId = deriveDeterministicDatasetRunId(
    scheduledTriggerId,
    scheduledFor,
    runAsUserId
  );

  try {
    const result = await withRef(manageDbPool, resolvedRef, async (manageDb) => {
      const config = await getDatasetRunConfigById(manageDb)({
        scopes: { tenantId, projectId, datasetRunConfigId },
      });

      if (!config) {
        return {
          success: false as const,
          configDeleted: true as const,
          error: `Dataset run config ${datasetRunConfigId} no longer exists.`,
        };
      }

      const [agentRelations, evaluatorRelations] = await Promise.all([
        getDatasetRunConfigAgentRelations(manageDb)({
          scopes: { tenantId, projectId, datasetRunConfigId },
        }),
        getDatasetRunConfigEvaluatorRelations(manageDb)({
          scopes: { tenantId, projectId, datasetRunConfigId },
        }),
      ]);

      const agentIds = agentRelations.map((r) => r.agentId);
      if (agentIds.length === 0) {
        return {
          success: false as const,
          configMisconfigured: true as const,
          error: `No agents configured for dataset run config ${datasetRunConfigId}.`,
        };
      }

      const evaluatorIds = evaluatorRelations.map((r) => r.evaluatorId);
      const effectiveDelay = Math.max(config.dispatchDelayMs ?? 0, staggerDelayMs ?? 0);

      const runResult = await executeDatasetRun({
        tenantId,
        projectId,
        datasetRunConfigId,
        agentIds,
        manageDb,
        resolvedRef,
        scheduledTriggerId,
        evaluatorIds: evaluatorIds.length > 0 ? evaluatorIds : undefined,
        datasetRunId,
        runAsUserId,
        staggerDelayMs: effectiveDelay > 0 ? effectiveDelay : undefined,
        scheduledFor,
        ref: triggerRef !== 'main' ? triggerRef : undefined,
      });

      return { success: true as const, datasetRunId: runResult.datasetRunId };
    });

    return result;
  } catch (err) {
    logger.error(
      { err, scheduledTriggerId, datasetRunConfigId },
      'executeDatasetRunStep threw unexpectedly'
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
