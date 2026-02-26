import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import type { getSlackClient } from '../client';
import type { StreamResult } from './streaming';
import { streamAgentResponse } from './streaming';

const logger = getLogger('slack-execution');

export type SlackEntryPoint =
  | 'app_mention'
  | 'direct_message'
  | 'slash_command'
  | 'message_shortcut'
  | 'modal_submission'
  | 'smart_link_resume'
  | 'tool_approval';

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
  /** Original unformatted user text shown publicly in Slack thread anchors. Falls back to `question`. */
  rawMessageText?: string;
  conversationId: string;
  entryPoint?: SlackEntryPoint;
}

export async function executeAgentPublicly(params: PublicExecutionParams): Promise<StreamResult> {
  const { slackClient, channel, threadTs, agentName } = params;

  let thinkingMessageTs = '';
  try {
    const ackMessage = await slackClient.chat.postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text: SlackStrings.status.thinking(agentName),
    });
    thinkingMessageTs = ackMessage.ts || '';
  } catch (error) {
    logger.warn({ error, channel }, 'Failed to post thinking acknowledgment - proceeding anyway');
  }

  // When no threadTs is provided (e.g. slash command at channel root), the thinking
  // message becomes the thread anchor so all subsequent streaming updates reply to it.
  const effectiveThreadTs = threadTs || thinkingMessageTs || undefined;

  logger.info(
    {
      channel,
      threadTs: effectiveThreadTs,
      agentId: params.agentId,
      conversationId: params.conversationId,
    },
    'Starting stream'
  );

  return streamAgentResponse({
    slackClient: params.slackClient,
    channel,
    threadTs: effectiveThreadTs,
    thinkingMessageTs,
    slackUserId: params.slackUserId,
    teamId: params.teamId,
    jwtToken: params.jwtToken,
    projectId: params.projectId,
    agentId: params.agentId,
    question: params.question,
    rawMessageText: params.rawMessageText,
    agentName,
    conversationId: params.conversationId,
    entryPoint: params.entryPoint,
  });
}
