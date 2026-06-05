import { createSign } from 'node:crypto';
import type { AgentsManageDatabaseClient } from '@inkeep/agents-core';
import {
  createApiError,
  createBranch,
  createConversation,
  createCoPilotRun,
  generateId,
  getAppById,
  getCoPilotRunByBranchName,
  getFeedbackByIds,
  getInProcessFetch,
  getProjectMainResolvedRef,
  getProjectScopedRef,
  resolveRef,
  updateCoPilotRunStatusByConversationId,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('ImprovementService');

const COPILOT_JWT_AUDIENCE = 'inkeep-copilot';

async function markRunFailedOnLaunchError(conversationId: string): Promise<void> {
  try {
    await updateCoPilotRunStatusByConversationId(runDbClient)({
      conversationId,
      status: 'failed',
    });
  } catch (err) {
    logger.warn({ err, conversationId }, 'Failed to mark copilot run as failed on launch error');
  }
}

interface CopilotConfig {
  tenantId: string;
  projectId: string;
  agentId: string;
  appId: string;
}

let copilotConfigPromise: Promise<CopilotConfig> | null = null;

async function getCopilotConfig(): Promise<CopilotConfig> {
  if (copilotConfigPromise) return copilotConfigPromise;

  copilotConfigPromise = (async () => {
    const appId = env.PUBLIC_INKEEP_COPILOT_APP_ID;
    if (!appId) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'PUBLIC_INKEEP_COPILOT_APP_ID is required',
      });
    }

    const app = await getAppById(runDbClient)(appId);
    if (!app) {
      throw createApiError({
        code: 'internal_server_error',
        message: `Copilot app not found for id: ${appId}`,
      });
    }
    if (!app.tenantId || !app.defaultProjectId || !app.defaultAgentId) {
      throw createApiError({
        code: 'internal_server_error',
        message: `Copilot app "${appId}" is missing tenantId, defaultProjectId, or defaultAgentId`,
      });
    }

    return {
      tenantId: app.tenantId,
      projectId: app.defaultProjectId,
      agentId: app.defaultAgentId,
      appId,
    };
  })().catch((err) => {
    copilotConfigPromise = null;
    throw err;
  });

  return copilotConfigPromise;
}

export async function isCopilotScope(params: {
  tenantId: string;
  projectId: string;
}): Promise<boolean> {
  try {
    const copilot = await getCopilotConfig();
    return copilot.tenantId === params.tenantId && copilot.projectId === params.projectId;
  } catch (err) {
    logger.warn(
      { err, tenantId: params.tenantId, projectId: params.projectId },
      'Failed to check copilot scope, defaulting to false'
    );
    return false;
  }
}

function base64url(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input;
  return b.toString('base64url');
}

function signCopilotJwt(userId: string): string {
  const privateKeyB64 = env.INKEEP_COPILOT_JWT_PRIVATE_KEY;
  const kid = env.INKEEP_COPILOT_JWT_KID;

  if (!privateKeyB64 || !kid) {
    throw createApiError({
      code: 'internal_server_error',
      message: 'INKEEP_COPILOT_JWT_PRIVATE_KEY and INKEEP_COPILOT_JWT_KID are required',
    });
  }

  const privateKeyPem = Buffer.from(privateKeyB64, 'base64').toString('utf-8');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = base64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = base64url(
    JSON.stringify({
      sub: userId,
      aud: COPILOT_JWT_AUDIENCE,
      iat: now,
      exp,
      internal: true,
    })
  );
  const signingInput = `${header}.${body}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKeyPem, 'base64url');

  return `${signingInput}.${signature}`;
}

export interface TriggerImprovementParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  feedbackIds: string[];
  additionalContext?: string;
  userId: string;
  forwardedCookie?: string;
  db: AgentsManageDatabaseClient;
}

export interface TriggerImprovementResult {
  branchName: string;
  conversationId: string;
}

export async function triggerImprovement(
  params: TriggerImprovementParams
): Promise<TriggerImprovementResult> {
  const {
    tenantId,
    projectId,
    agentId,
    feedbackIds,
    additionalContext,
    userId,
    forwardedCookie,
    db,
  } = params;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const branchName = `improvement_${agentId}_${timestamp}`;
  const conversationId = generateId();

  logger.info({ tenantId, projectId, agentId, branchName }, 'Triggering improvement run');

  await createBranch(db)({ tenantId, projectId, name: branchName, fromBranch: 'main' });
  logger.info({ branchName }, 'Improvement branch created');

  const scopedRef = await resolveRef(db)(getProjectScopedRef(tenantId, projectId, branchName));
  if (!scopedRef) {
    throw createApiError({
      code: 'internal_server_error',
      message: `Failed to resolve newly created improvement branch: ${branchName}`,
    });
  }
  const resolvedBranchRef = { ...scopedRef, name: branchName };

  const copilot = await getCopilotConfig();
  const copilotMainRef = await getProjectMainResolvedRef(db)(copilot.tenantId, copilot.projectId);

  await createConversation(runDbClient)({
    id: conversationId,
    tenantId: copilot.tenantId,
    projectId: copilot.projectId,
    activeSubAgentId: 'orchestrator',
    ref: copilotMainRef,
  });

  await createCoPilotRun(runDbClient)({
    tenantId,
    projectId,
    id: generateId(),
    ref: resolvedBranchRef,
    conversationId,
    feedbackIds,
    status: 'running',
  });

  const userMessage = [
    `Improvement branch: "${branchName}" (already created from main).`,
    `Feedback IDs: ${feedbackIds.join(', ')}`,
    additionalContext ? `\nAdditional context from the builder:\n${additionalContext}` : '',
  ].join('\n');

  const jwt = signCopilotJwt(userId);

  const inProcessFetch = getInProcessFetch();
  inProcessFetch('http://localhost/run/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-inkeep-app-id': copilot.appId,
      ...(forwardedCookie && { 'x-forwarded-cookie': forwardedCookie }),
      'x-target-tenant-id': tenantId,
      'x-target-project-id': projectId,
      'x-target-agent-id': agentId,
      'x-target-branch-name': branchName,
      'x-emit-operations': 'true',
    },
    body: JSON.stringify({
      model: `${copilot.projectId}/${copilot.agentId}`,
      messages: [{ role: 'user', content: userMessage }],
      stream: false,
      conversationId,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>');
        logger.error(
          { status: res.status, body: text.slice(0, 500), branchName, conversationId },
          'Improvement chat API returned non-OK'
        );
        await markRunFailedOnLaunchError(conversationId);
      }
    })
    .catch(async (err) => {
      logger.error({ err, branchName, conversationId }, 'Failed to fire improvement chat API call');
      await markRunFailedOnLaunchError(conversationId);
    });

  logger.info({ branchName, conversationId }, 'Improvement run triggered');

  return { branchName, conversationId };
}

export interface ContinueImprovementParams {
  tenantId: string;
  projectId: string;
  branchName: string;
  message: string;
  userId: string;
  forwardedCookie?: string;
  db: AgentsManageDatabaseClient;
}

export interface ContinueImprovementResult {
  conversationId: string;
}

export async function continueImprovement(
  params: ContinueImprovementParams
): Promise<ContinueImprovementResult> {
  const { tenantId, projectId, branchName, message, userId, forwardedCookie, db } = params;

  const existingRun = await getCoPilotRunByBranchName(runDbClient)({
    scopes: { tenantId, projectId },
    branchName,
  });

  if (!existingRun) {
    throw createApiError({
      code: 'not_found',
      message: `No copilot run found for branch: ${branchName}`,
    });
  }

  const feedbackIds = existingRun.feedbackIds ?? [];
  if (feedbackIds.length === 0) {
    throw createApiError({
      code: 'bad_request',
      message: `Copilot run for branch "${branchName}" has no feedback to derive agent from`,
    });
  }

  const feedbackItems = await getFeedbackByIds(runDbClient)({
    scopes: { tenantId, projectId },
    feedbackIds,
  });
  const agentId = feedbackItems.find((f) => f.agentId)?.agentId;
  if (!agentId) {
    throw createApiError({
      code: 'bad_request',
      message: `Could not derive target agentId from feedback for branch: ${branchName}`,
    });
  }

  const conversationId = generateId();
  const copilot = await getCopilotConfig();
  const copilotMainRef = await getProjectMainResolvedRef(db)(copilot.tenantId, copilot.projectId);

  await createConversation(runDbClient)({
    id: conversationId,
    tenantId: copilot.tenantId,
    projectId: copilot.projectId,
    activeSubAgentId: 'orchestrator',
    ref: copilotMainRef,
  });

  await createCoPilotRun(runDbClient)({
    tenantId,
    projectId,
    id: generateId(),
    ref: existingRun.ref,
    conversationId,
    feedbackIds,
    status: 'running',
  });

  const jwt = signCopilotJwt(userId);

  const userMessage = [`Continuing improvement on branch: "${branchName}".`, message].join('\n');

  const inProcessFetch = getInProcessFetch();
  inProcessFetch('http://localhost/run/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-inkeep-app-id': copilot.appId,
      ...(forwardedCookie && { 'x-forwarded-cookie': forwardedCookie }),
      'x-target-tenant-id': tenantId,
      'x-target-project-id': projectId,
      'x-target-agent-id': agentId,
      'x-target-branch-name': branchName,
      'x-emit-operations': 'true',
    },
    body: JSON.stringify({
      model: `${copilot.projectId}/${copilot.agentId}`,
      messages: [{ role: 'user', content: userMessage }],
      stream: false,
      conversationId,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>');
        logger.error(
          { status: res.status, body: text.slice(0, 500), branchName, conversationId },
          'Continue improvement chat API returned non-OK'
        );
        await markRunFailedOnLaunchError(conversationId);
      }
    })
    .catch(async (err) => {
      logger.error({ err, branchName, conversationId }, 'Failed to fire continue improvement call');
      await markRunFailedOnLaunchError(conversationId);
    });

  logger.info({ branchName, conversationId }, 'Improvement continuation triggered');

  return { conversationId };
}
