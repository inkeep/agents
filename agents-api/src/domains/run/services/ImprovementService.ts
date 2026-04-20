import { createSign } from 'node:crypto';
import type { AgentsManageDatabaseClient } from '@inkeep/agents-core';
import {
  appendConversationId,
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
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('ImprovementService');

interface CopilotConfig {
  tenantId: string;
  projectId: string;
  agentId: string;
  appId: string;
  origin: string;
}

function deriveOriginFromAllowedDomains(allowedDomains: string[] | undefined): string {
  const first = allowedDomains?.find((d) => d && d !== '*');
  if (!first) {
    throw new Error(
      'Copilot app allowedDomains must contain at least one concrete domain',
    );
  }
  const host = first.startsWith('*.') ? first.slice(2) : first;
  return `http://${host}`;
}

let copilotConfigPromise: Promise<CopilotConfig> | null = null;

async function getCopilotConfig(): Promise<CopilotConfig> {
  if (copilotConfigPromise) return copilotConfigPromise;

  copilotConfigPromise = (async () => {
    const appId = env.PUBLIC_INKEEP_COPILOT_APP_ID;
    if (!appId) {
      throw new Error('PUBLIC_INKEEP_COPILOT_APP_ID is required');
    }

    const app = await getAppById(runDbClient)(appId);
    if (!app) {
      throw new Error(`Copilot app not found for id: ${appId}`);
    }
    if (!app.tenantId || !app.defaultProjectId || !app.defaultAgentId) {
      throw new Error(
        `Copilot app "${appId}" is missing tenantId, defaultProjectId, or defaultAgentId`,
      );
    }

    const allowedDomains =
      app.config.type === 'web_client' ? app.config.webClient.allowedDomains : [];
    const origin = deriveOriginFromAllowedDomains(allowedDomains);

    return {
      tenantId: app.tenantId,
      projectId: app.defaultProjectId,
      agentId: app.defaultAgentId,
      appId,
      origin,
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
  } catch {
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
    throw new Error('INKEEP_COPILOT_JWT_PRIVATE_KEY and INKEEP_COPILOT_JWT_KID are required');
  }

  const privateKeyPem = Buffer.from(privateKeyB64, 'base64').toString('utf-8');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = base64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = base64url(JSON.stringify({ sub: userId, iat: now, exp }));
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
  params: TriggerImprovementParams,
): Promise<TriggerImprovementResult> {
  const { tenantId, projectId, agentId, feedbackIds, additionalContext, userId, forwardedCookie, db } =
    params;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const branchName = `improvement_${agentId}_${timestamp}`;
  const conversationId = generateId();

  logger.info({ tenantId, projectId, agentId, branchName }, 'Triggering improvement run');

  await createBranch(db)({ tenantId, projectId, name: branchName, fromBranch: 'main' });
  logger.info({ branchName }, 'Improvement branch created');

  const scopedRef = await resolveRef(db)(getProjectScopedRef(tenantId, projectId, branchName));
  if (!scopedRef) {
    throw new Error(`Failed to resolve newly created improvement branch: ${branchName}`);
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
    conversationIds: [conversationId],
    feedbackIds,
    triggeredBy: userId,
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
      Origin: copilot.origin,
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
          'Improvement chat API returned non-OK',
        );
      }
    })
    .catch((err) => {
      logger.error({ err, branchName, conversationId }, 'Failed to fire improvement chat API call');
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
  params: ContinueImprovementParams,
): Promise<ContinueImprovementResult> {
  const { tenantId, projectId, branchName, message, userId, forwardedCookie, db } = params;

  const run = await getCoPilotRunByBranchName(runDbClient)({
    scopes: { tenantId, projectId },
    branchName,
  });

  if (!run) {
    throw new Error(`No copilot run found for branch: ${branchName}`);
  }

  const feedbackIds = run.feedbackIds ?? [];
  if (feedbackIds.length === 0) {
    throw new Error(`Copilot run for branch "${branchName}" has no feedback to derive agent from`);
  }

  const feedbackItems = await getFeedbackByIds(runDbClient)({
    scopes: { tenantId, projectId },
    feedbackIds,
  });
  const agentId = feedbackItems.find((f) => f.agentId)?.agentId;
  if (!agentId) {
    throw new Error(`Could not derive target agentId from feedback for branch: ${branchName}`);
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

  await appendConversationId(runDbClient)({
    scopes: { tenantId, projectId },
    id: run.id,
    conversationId,
    status: 'running',
  });

  const jwt = signCopilotJwt(userId);

  const userMessage = [
    `Continuing improvement on branch: "${branchName}".`,
    message,
  ].join('\n');

  const inProcessFetch = getInProcessFetch();
  inProcessFetch('http://localhost/run/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-inkeep-app-id': copilot.appId,
      Origin: copilot.origin,
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
  }).catch((err) => {
    logger.error({ err, branchName, conversationId }, 'Failed to fire continue improvement call');
  });

  logger.info({ branchName, conversationId }, 'Improvement continuation triggered');

  return { conversationId };
}
