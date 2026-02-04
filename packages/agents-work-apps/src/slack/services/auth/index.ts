/**
 * Slack JWT Authentication Service
 *
 * Provides JWT-based authentication for Slack integrations to call Inkeep APIs.
 * This is Slack's dedicated auth service - isolated from other auth mechanisms.
 *
 * Flow:
 * 1. Slack user links account via /inkeep link → user mapping saved in DB
 * 2. When Slack needs to call APIs, we look up the inkeepUserId from the mapping
 * 3. Sign a short-lived JWT with the user's identity and Slack context
 * 4. Use the JWT to call manage/run APIs
 *
 * This approach:
 * - Doesn't require storing API keys in Nango metadata
 * - Uses the linked user's permissions
 * - Provides audit trail of who triggered the action
 * - Tokens expire in 5 minutes for security
 */

import {
  findWorkAppSlackUserMapping,
  parseSSEResponse,
  type SlackAccessTokenPayload,
  signSlackUserToken,
  verifySlackUserToken,
} from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('slack-jwt-auth');

const DEFAULT_CLIENT_ID = 'work-apps-slack';

export interface SlackUserContext {
  slackUserId: string;
  slackTeamId: string;
  slackEnterpriseId?: string;
}

export interface SlackJwtResult {
  token: string;
  inkeepUserId: string;
  tenantId: string;
}

export class SlackJwtAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_LINKED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'EXECUTION_FAILED'
  ) {
    super(message);
    this.name = 'SlackJwtAuthError';
  }
}

/**
 * Get a JWT token for a Slack user to call Inkeep APIs.
 *
 * Looks up the user's linked Inkeep account and generates a short-lived JWT.
 */
export async function getSlackUserJwt(
  context: SlackUserContext,
  tenantId: string
): Promise<SlackJwtResult> {
  const userMapping = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    context.slackUserId,
    context.slackTeamId,
    DEFAULT_CLIENT_ID
  );

  if (!userMapping) {
    throw new SlackJwtAuthError(
      'Slack account not linked. Use /inkeep link to connect your account.',
      'NOT_LINKED'
    );
  }

  const token = await signSlackUserToken({
    inkeepUserId: userMapping.inkeepUserId,
    tenantId,
    slackTeamId: context.slackTeamId,
    slackUserId: context.slackUserId,
    slackEnterpriseId: context.slackEnterpriseId,
    slackEmail: userMapping.slackEmail || undefined,
  });

  logger.debug(
    {
      slackUserId: context.slackUserId,
      slackTeamId: context.slackTeamId,
      inkeepUserId: userMapping.inkeepUserId,
    },
    'Generated Slack JWT for API calls'
  );

  return {
    token,
    inkeepUserId: userMapping.inkeepUserId,
    tenantId,
  };
}

/**
 * Verify a Slack JWT token and extract the payload.
 */
export async function verifySlackJwt(token: string): Promise<SlackAccessTokenPayload> {
  const result = await verifySlackUserToken(token);

  if (!result.valid || !result.payload) {
    throw new SlackJwtAuthError(result.error || 'Invalid token', 'TOKEN_INVALID');
  }

  return result.payload;
}

export interface ChatCompletionOptions {
  conversationId?: string;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  conversationId?: string;
}

/**
 * Execute an agent using Slack JWT authentication.
 *
 * This is the unified way to call agents from Slack - uses JWT, not API keys.
 */
export async function executeAgentWithSlackJwt(params: {
  jwt: string;
  projectId: string;
  agentId: string;
  message: string;
  options?: ChatCompletionOptions;
}): Promise<ChatCompletionResult> {
  const { jwt, projectId, agentId, message, options = {} } = params;
  const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  logger.debug({ projectId, agentId, stream: options.stream }, 'Executing agent with Slack JWT');

  const response = await fetch(`${apiBaseUrl}/run/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-inkeep-project-id': projectId,
      'x-inkeep-agent-id': agentId,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      stream: options.stream ?? false,
      ...(options.conversationId && { conversationId: options.conversationId }),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error(
      { status: response.status, errorBody, projectId, agentId },
      'Agent execution failed'
    );

    if (response.status === 401) {
      throw new SlackJwtAuthError(
        'Authentication failed. Please re-link your Slack account.',
        'TOKEN_EXPIRED'
      );
    }

    throw new SlackJwtAuthError(`Agent execution failed: ${response.status}`, 'EXECUTION_FAILED');
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const result = parseSSEResponse(text);

    if (result.error) {
      throw new SlackJwtAuthError(result.error, 'EXECUTION_FAILED');
    }

    return {
      content: result.text || 'No response from agent',
    };
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    message?: { content?: string };
    conversationId?: string;
  };

  const content =
    result.choices?.[0]?.message?.content || result.message?.content || 'No response from agent';

  return {
    content,
    conversationId: result.conversationId,
  };
}

/**
 * Stream agent response with Slack JWT authentication.
 *
 * Returns a readable stream of SSE events for real-time streaming to Slack.
 */
export async function streamAgentWithSlackJwt(params: {
  jwt: string;
  projectId: string;
  agentId: string;
  message: string;
}): Promise<Response> {
  const { jwt, projectId, agentId, message } = params;
  const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  logger.debug({ projectId, agentId }, 'Streaming agent with Slack JWT');

  const response = await fetch(`${apiBaseUrl}/run/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-inkeep-project-id': projectId,
      'x-inkeep-agent-id': agentId,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error({ status: response.status, errorBody, projectId, agentId }, 'Agent stream failed');

    if (response.status === 401) {
      throw new SlackJwtAuthError(
        'Authentication failed. Please re-link your Slack account.',
        'TOKEN_EXPIRED'
      );
    }

    throw new SlackJwtAuthError(`Agent stream failed: ${response.status}`, 'EXECUTION_FAILED');
  }

  return response;
}

export type { SlackAccessTokenPayload };
