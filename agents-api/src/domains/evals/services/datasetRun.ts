import type {
  AgentsManageDatabaseClient,
  DatasetItemInput,
  DatasetRunItem,
  ResolvedRef,
} from '@inkeep/agents-core';
import {
  createDatasetRun,
  createEvaluationJobConfig,
  createEvaluationJobConfigEvaluatorRelation,
  createEvaluationRun,
  createScheduledTriggerInvocation,
  generateId,
  getAgentDatasetRelationsByDataset,
  getDatasetRunById,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getPostgresErrorCode,
  getScheduledTriggerInvocationByIdempotencyKey,
  linkDatasetRunToEvaluationJobConfig,
  listDatasetItems,
  listEvaluationRunsByJobConfigId,
  markScheduledTriggerInvocationFailed,
  SCHEDULED_TRIGGER_DEFAULT_DISPATCH_DELAY_MS,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { runDatasetItemWorkflow } from '../workflow/functions/runDatasetItem';

export type DatasetRunQueueItem = DatasetRunItem & {
  scheduledTriggerInvocationId: string;
  scheduledTriggerId?: string;
};

const executeLogger = getLogger('executeDatasetRun');
const rerunLogger = getLogger('createInvocationAndQueue');

export interface ExecuteDatasetRunParams {
  tenantId: string;
  projectId: string;
  datasetRunConfigId: string;
  agentIds: string[];
  manageDb: AgentsManageDatabaseClient;
  resolvedRef?: ResolvedRef;
  scheduledTriggerId?: string;
  scheduledTriggerIdByAgent?: Record<string, string>;
  evaluatorIds?: string[];
  datasetRunId?: string;
  runAsUserId?: string;
  staggerDelayMs?: number;
  scheduledFor?: string;
  ref?: string;
}

export interface ExecuteDatasetRunResult {
  datasetRunId: string;
  totalItems: number;
  skippedInvocations: number;
  failedInvocations: number;
  failedQueueing: number;
}

export async function executeDatasetRun(
  params: ExecuteDatasetRunParams
): Promise<ExecuteDatasetRunResult> {
  const {
    tenantId,
    projectId,
    datasetRunConfigId,
    agentIds,
    manageDb,
    resolvedRef,
    scheduledTriggerId,
    evaluatorIds,
    ref,
  } = params;

  const config = await getDatasetRunConfigById(manageDb)({
    scopes: { tenantId, projectId, datasetRunConfigId },
  });

  if (!config) {
    throw new Error(`Dataset run config not found: ${datasetRunConfigId}`);
  }

  const datasetId = config.datasetId;
  const [datasetItems, allAgentRelations, datasetAgentRelations] = await Promise.all([
    listDatasetItems(manageDb)({ scopes: { tenantId, projectId, datasetId } }),
    getDatasetRunConfigAgentRelations(manageDb)({
      scopes: { tenantId, projectId, datasetRunConfigId },
    }),
    getAgentDatasetRelationsByDataset(manageDb)({
      scopes: { tenantId, projectId, datasetId },
    }),
  ]);

  if (datasetItems.length === 0) {
    throw new Error('Dataset has no items. Add items to the dataset before triggering a run.');
  }

  const configAgentIds = new Set(allAgentRelations.map((r) => r.agentId));
  const requestedAgentIds = agentIds.filter((id) => configAgentIds.has(id));

  if (requestedAgentIds.length === 0) {
    throw new Error('None of the requested agents are configured for this run config.');
  }

  let filteredAgentIds = requestedAgentIds;
  if (datasetAgentRelations.length > 0) {
    const allowedAgentIds = new Set(datasetAgentRelations.map((r) => r.agentId));
    filteredAgentIds = requestedAgentIds.filter((id) => allowedAgentIds.has(id));

    if (filteredAgentIds.length < requestedAgentIds.length) {
      const excluded = requestedAgentIds.filter((id) => !allowedAgentIds.has(id));
      executeLogger.info(
        { datasetRunConfigId, datasetId, excludedAgents: excluded },
        'Excluded agents not scoped to this dataset'
      );
    }

    if (filteredAgentIds.length === 0) {
      throw new Error('None of the requested agents are scoped to this dataset.');
    }
  }

  const datasetRunId = params.datasetRunId ?? generateId();
  const triggerScope = scheduledTriggerId ?? datasetRunId;
  const triggerIdForAgent = (agentId: string) =>
    params.scheduledTriggerIdByAgent?.[agentId] ?? triggerScope;

  let runCreated = false;
  try {
    await createDatasetRun(runDbClient)({
      id: datasetRunId,
      tenantId,
      projectId,
      datasetId: config.datasetId,
      datasetRunConfigId,
      evaluationJobConfigId: undefined,
      ref: resolvedRef,
    });
    runCreated = true;
  } catch (error) {
    if (getPostgresErrorCode(error) === '23505') {
      executeLogger.info(
        { datasetRunId },
        'Dataset run already exists (idempotent retry), proceeding to queue items'
      );
    } else {
      throw error;
    }
  }

  let evaluationRunId: string | undefined;
  if (evaluatorIds && evaluatorIds.length > 0) {
    const needsEvalSetup = async (): Promise<
      { create: true } | { create: false; evaluationRunId: string | undefined }
    > => {
      if (runCreated) return { create: true };
      const existingRun = await getDatasetRunById(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId },
      });
      if (existingRun?.evaluationJobConfigId) {
        const existingEvalRuns = await listEvaluationRunsByJobConfigId(runDbClient)({
          scopes: { tenantId, projectId },
          evaluationJobConfigId: existingRun.evaluationJobConfigId,
        });
        return { create: false, evaluationRunId: existingEvalRuns[0]?.id };
      }
      executeLogger.info(
        { datasetRunId },
        'Dataset run exists but evaluation setup is missing (partial failure on prior attempt), creating evaluation config'
      );
      return { create: true };
    };

    const evalState = await needsEvalSetup();
    if (evalState.create) {
      const jobConfigId = generateId();
      await createEvaluationJobConfig(manageDb)({
        id: jobConfigId,
        tenantId,
        projectId,
        jobFilters: { datasetRunIds: [datasetRunId] },
      });
      await Promise.all(
        evaluatorIds.map((evaluatorId: string) =>
          createEvaluationJobConfigEvaluatorRelation(manageDb)({
            tenantId,
            projectId,
            id: generateId(),
            evaluationJobConfigId: jobConfigId,
            evaluatorId,
          })
        )
      );
      await linkDatasetRunToEvaluationJobConfig(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId },
        evaluationJobConfigId: jobConfigId,
      });
      evaluationRunId = generateId();
      await createEvaluationRun(runDbClient)({
        id: evaluationRunId,
        tenantId,
        projectId,
        evaluationJobConfigId: jobConfigId,
        ref: resolvedRef,
      });
    } else {
      evaluationRunId = evalState.evaluationRunId;
    }
  }

  const invocationPairs = filteredAgentIds.flatMap((agentId) =>
    datasetItems.map((datasetItem) => ({ agentId, datasetItem }))
  );

  const batchScheduledFor = params.scheduledFor ?? new Date().toISOString();
  const invocations = await Promise.allSettled(
    invocationPairs.map(({ agentId, datasetItem }) =>
      createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerIdForAgent(agentId),
        status: 'pending',
        scheduledFor: batchScheduledFor,
        resolvedPayload: {
          datasetItemId: datasetItem.id,
          datasetRunId,
          messages: datasetItem.input.messages,
        },
        idempotencyKey: `${datasetRunId}-${agentId}-${datasetItem.id}`,
        attemptNumber: 1,
        runAsUserId: params.runAsUserId,
      })
    )
  );

  const invocationMap = new Map<string, string>();
  let skippedInvocations = 0;
  let failedInvocations = 0;
  for (let idx = 0; idx < invocationPairs.length; idx++) {
    const result = invocations[idx];
    const pair = invocationPairs[idx];
    const key = `${pair.agentId}:${pair.datasetItem.id}`;

    if (result.status === 'fulfilled') {
      invocationMap.set(key, result.value.id);
    } else {
      if (getPostgresErrorCode(result.reason) === '23505') {
        const idempotencyKey = `${datasetRunId}-${pair.agentId}-${pair.datasetItem.id}`;
        const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
          idempotencyKey,
        });
        if (existing && existing.status === 'pending') {
          invocationMap.set(key, existing.id);
          executeLogger.info(
            {
              agentId: pair.agentId,
              datasetItemId: pair.datasetItem.id,
              invocationId: existing.id,
            },
            'Recovered pending invocation on retry'
          );
        } else if (existing) {
          skippedInvocations++;
          executeLogger.info(
            { agentId: pair.agentId, datasetItemId: pair.datasetItem.id, status: existing.status },
            'Invocation already dispatched, skipping re-queue'
          );
        } else {
          failedInvocations++;
          executeLogger.warn(
            { agentId: pair.agentId, datasetItemId: pair.datasetItem.id, idempotencyKey },
            '23505 conflict but invocation not found on recovery lookup; counting as failed'
          );
        }
      } else {
        failedInvocations++;
        executeLogger.error({ err: result.reason, pair }, 'Failed to create invocation');
      }
    }
  }

  const items: DatasetRunQueueItem[] = invocationPairs.flatMap(({ agentId, datasetItem }) => {
    const invocationId = invocationMap.get(`${agentId}:${datasetItem.id}`);
    if (!invocationId) return [];
    return [
      {
        agentId,
        id: datasetItem.id,
        input: datasetItem.input,
        expectedOutput: datasetItem.expectedOutput,
        scheduledTriggerInvocationId: invocationId,
        scheduledTriggerId: triggerIdForAgent(agentId),
      },
    ];
  });

  let failedQueueing = 0;
  if (items.length > 0) {
    const queueResult = await queueDatasetRunItems({
      tenantId,
      projectId,
      datasetRunId,
      items,
      evaluatorIds,
      evaluationRunId,
      ref,
      runAsUserId: params.runAsUserId,
      staggerDelayMs: params.staggerDelayMs,
    });
    failedQueueing = queueResult.failed;
  }

  const totalItems = items.length - failedQueueing;

  executeLogger.info(
    {
      datasetRunConfigId,
      datasetRunId,
      totalItems,
      skippedInvocations,
      failedInvocations,
      failedQueueing,
    },
    'Dataset run executed'
  );

  return { datasetRunId, totalItems, skippedInvocations, failedInvocations, failedQueueing };
}

export async function createInvocationAndQueue(params: {
  tenantId: string;
  projectId: string;
  datasetRunId: string;
  agentId: string;
  scheduledTriggerId: string;
  datasetItem: {
    id: string;
    input: DatasetRunItem['input'];
    expectedOutput: DatasetRunItem['expectedOutput'];
  };
  idempotencyKey: string;
  resolvedPayload: Record<string, unknown>;
  ref?: string;
  runAsUserId?: string;
}): Promise<{ invocationId: string; queued: number; failed: number }> {
  const {
    tenantId,
    projectId,
    datasetRunId,
    agentId,
    scheduledTriggerId,
    datasetItem,
    idempotencyKey,
    resolvedPayload,
    ref,
    runAsUserId,
  } = params;

  let invocationId = generateId();

  try {
    await createScheduledTriggerInvocation(runDbClient)({
      id: invocationId,
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      status: 'pending',
      scheduledFor: new Date().toISOString(),
      resolvedPayload,
      idempotencyKey,
      attemptNumber: 1,
      runAsUserId,
    });
  } catch (error) {
    if (getPostgresErrorCode(error) !== '23505') {
      throw error;
    }
    const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
      idempotencyKey,
    });
    if (existing) {
      invocationId = existing.id;
      rerunLogger.info(
        { idempotencyKey, invocationId, status: existing.status },
        'Recovered existing invocation on retry'
      );
      if (existing.status !== 'pending') {
        return { invocationId, queued: 0, failed: 0 };
      }
    } else {
      throw error;
    }
  }

  const queueResult = await queueDatasetRunItems({
    tenantId,
    projectId,
    datasetRunId,
    items: [
      {
        agentId,
        id: datasetItem.id,
        input: datasetItem.input,
        expectedOutput: datasetItem.expectedOutput,
        scheduledTriggerInvocationId: invocationId,
        scheduledTriggerId,
      },
    ],
    ref,
  });

  return { invocationId, ...queueResult };
}

export async function queueDatasetRunItems(params: {
  tenantId: string;
  projectId: string;
  datasetRunId: string;
  items: DatasetRunQueueItem[];
  evaluatorIds?: string[];
  evaluationRunId?: string;
  ref?: string;
  runAsUserId?: string;
  staggerDelayMs?: number;
}): Promise<{ queued: number; failed: number }> {
  const {
    tenantId,
    projectId,
    datasetRunId,
    items,
    evaluatorIds,
    evaluationRunId,
    ref,
    runAsUserId,
    staggerDelayMs = SCHEDULED_TRIGGER_DEFAULT_DISPATCH_DELAY_MS,
  } = params;
  const logger = getLogger('workflow-triggers');

  const results = await Promise.allSettled(
    items.map(async (item, index) => {
      await start(runDatasetItemWorkflow, [
        {
          tenantId,
          projectId,
          agentId: item.agentId,
          datasetItemId:
            item.id ??
            (() => {
              throw new Error(`Dataset item missing id for agent ${item.agentId}`);
            })(),
          datasetItemInput: item.input as DatasetItemInput,
          datasetItemExpectedOutput: item.expectedOutput,
          datasetRunId,
          scheduledTriggerInvocationId: item.scheduledTriggerInvocationId,
          evaluatorIds,
          evaluationRunId,
          ref,
          delayBeforeExecutionMs: index * staggerDelayMs,
          triggerId: item.scheduledTriggerId,
          runAsUserId,
        },
      ]);
    })
  );

  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { item: items[i], reason: r.reason } : null))
    .filter((f): f is NonNullable<typeof f> => f !== null);

  await Promise.all(
    failures.map(({ item, reason }) => {
      logger.error(
        { err: reason, datasetItemId: item.id },
        'Failed to queue dataset item workflow'
      );
      if (!item.scheduledTriggerId || !item.scheduledTriggerInvocationId) {
        return undefined;
      }
      return markScheduledTriggerInvocationFailed(runDbClient)({
        scopes: { tenantId, projectId, agentId: item.agentId },
        scheduledTriggerId: item.scheduledTriggerId,
        invocationId: item.scheduledTriggerInvocationId,
      }).catch((err) =>
        logger.warn(
          { err, invocationId: item.scheduledTriggerInvocationId },
          'Failed to mark trigger invocation as failed'
        )
      );
    })
  );

  return { queued: results.length - failures.length, failed: failures.length };
}
