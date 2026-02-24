import { getLogger } from '../../../logger';
import type { getSlackClient } from '../client';
import type { StreamResult } from './streaming';
import { streamAgentResponse } from './streaming';

const logger = getLogger('slack-execution');

export interface PublicExecutionParams {
  slackClient: ReturnType<typeof getSlackClient>;
  channel: string;
  threadTs?: string;
  slackUserId: string;
  teamId: string;
  jwtToken: string;
  projectId: string;
  agentId: string;
  agentName: string;
  question: string;
  conversationId: string;
}

export async function executeAgentPublicly(params: PublicExecutionParams): Promise<StreamResult> {
  const { slackClient, channel, threadTs, agentName } = params;

  const ackMessage = await slackClient.chat.postMessage({
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    text: `_${agentName} is thinking..._`,
  });

  logger.info(
    { channel, threadTs, agentId: params.agentId, conversationId: params.conversationId },
    'Posted thinking acknowledgment, starting stream'
  );

  return streamAgentResponse({
    slackClient: params.slackClient,
    channel,
    threadTs,
    thinkingMessageTs: ackMessage.ts || '',
    slackUserId: params.slackUserId,
    teamId: params.teamId,
    jwtToken: params.jwtToken,
    projectId: params.projectId,
    agentId: params.agentId,
    question: params.question,
    agentName,
    conversationId: params.conversationId,
  });
}
