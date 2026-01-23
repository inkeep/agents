// ============================================================
// src/bolt/listeners/events/app-mention.ts
// Handle @Inkeep mentions in channels
// ============================================================

import type { App } from '@slack/bolt';

import { db } from '@/lib/db';
import { getEnv, STREAM_CONFIG } from '@/lib/env';
import { askInkeep } from '@/lib/inkeep';
import { strings as s } from '@/lib/strings';
import { isDupe, sleep, toSlack } from '@/lib/utils';

export function registerAppMentionEvent(app: App): void {
  app.event('app_mention', async ({ event, client, say, logger }) => {
    const { channel, user, ts, thread_ts: threadTs, text } = event;
    const env = getEnv();
    const botUserId = env.SLACK_BOT_USER_ID;

    // Deduplicate
    const eventId = `mention-${channel}-${ts}`;
    if (isDupe(eventId)) return;

    // Ensure user exists
    if (!user) {
      logger.warn('[app_mention] No user in event');
      return;
    }

    // Clean the message - remove the bot mention
    const cleanText = (text || '').replace(new RegExp(`<@${botUserId}>`, 'gi'), '').trim();

    // Check if this is in an existing tracked thread
    const targetThreadTs = threadTs || ts;

    if (threadTs) {
      const existing = await db.getThread(channel, threadTs);
      if (existing) {
        // Continue existing conversation
        await handleThreadContinuation(client, channel, threadTs, cleanText, existing, logger);
        return;
      }
    }

    // Get channel config for default agent
    const config = await db.getChannelConfig(channel);

    if (!config) {
      // No default configured - show ephemeral
      try {
        await client.chat.postEphemeral({
          channel,
          user,
          thread_ts: threadTs,
          text: `${s.mention.noChannelConfig}\n\n${s.mention.noChannelConfigAdmin}`,
        });
      } catch {
        // Might not have permission for ephemerals
        await say({
          text: `${s.mention.noChannelConfig} ${s.mention.noChannelConfigAdmin}`,
          thread_ts: targetThreadTs,
        });
      }
      return;
    }

    // Get agent info
    const agent = await db.getAgent(config.agentId, config.projectId);
    if (!agent) {
      await say({ text: s.ask.errorGeneric, thread_ts: targetThreadTs });
      return;
    }

    // If no question, just greet
    if (!cleanText) {
      await client.chat.postMessage({
        channel,
        thread_ts: ts,
        text: s.mention.greeting(agent.name),
      });

      // Track thread for future replies
      await db.createThread({
        threadTs: ts,
        channelId: channel,
        agentId: config.agentId,
        projectId: config.projectId,
        userId: user,
        conversationId: `thread-${channel}-${ts}-${config.agentId}`,
      });
      return;
    }

    // Post thinking message
    const thinkingMsg = await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: s.ask.thinking,
    });

    const messageTs = thinkingMsg.ts;
    if (!messageTs) {
      logger.error('[app_mention] No ts returned from postMessage');
      return;
    }

    // Track thread
    const conversationId = `thread-${channel}-${targetThreadTs}-${config.agentId}`;
    await db.createThread({
      threadTs: targetThreadTs,
      channelId: channel,
      agentId: config.agentId,
      projectId: config.projectId,
      userId: user,
      conversationId,
    });

    // Stream response
    await streamResponse(
      client,
      channel,
      messageTs,
      cleanText,
      conversationId,
      config.projectId,
      config.agentId,
      logger
    );
  });
}

async function handleThreadContinuation(
  client: unknown,
  channel: string,
  threadTs: string,
  question: string,
  threadData: { thread: unknown; agent: unknown },
  logger: unknown
): Promise<void> {
  const { thread } = threadData as {
    thread: { conversationId?: string; agentId: string; projectId: string };
  };
  const slackClient = client as {
    chat: { postMessage: (args: unknown) => Promise<{ ts?: string }> };
  };
  const log = logger as { error: (msg: string, ...args: unknown[]) => void };

  // Post thinking message
  const thinkingMsg = await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: s.ask.thinking,
  });

  const messageTs = thinkingMsg.ts;
  if (!messageTs) {
    log.error('[app_mention] No ts returned from postMessage');
    return;
  }

  // Use existing conversation ID for context
  const conversationId = thread.conversationId || `thread-${channel}-${threadTs}-${thread.agentId}`;

  await streamResponse(
    client,
    channel,
    messageTs,
    question || 'How can you help?',
    conversationId,
    thread.projectId,
    thread.agentId,
    logger
  );
}

async function streamResponse(
  client: unknown,
  channel: string,
  messageTs: string,
  question: string,
  conversationId: string,
  projectId: string,
  agentId: string,
  logger: unknown
): Promise<void> {
  const slackClient = client as { chat: { update: (args: unknown) => Promise<void> } };
  const log = logger as { error: (msg: string, ...args: unknown[]) => void };

  let lastUpdate = 0;
  let lastLen = 0;

  try {
    const response = await askInkeep(
      question,
      conversationId,
      projectId,
      agentId,
      async (fullText) => {
        const now = Date.now();
        if (now - lastUpdate < STREAM_CONFIG.throttleMs) return;
        if (fullText.length - lastLen < STREAM_CONFIG.minDeltaChars) return;

        try {
          await slackClient.chat.update({
            channel,
            ts: messageTs,
            text: `${toSlack(fullText)}${STREAM_CONFIG.cursor}`,
          });
          lastUpdate = now;
          lastLen = fullText.length;
        } catch {
          // Ignore update errors
        }
      }
    );

    await sleep(STREAM_CONFIG.finalizationDelayMs);
    await slackClient.chat.update({
      channel,
      ts: messageTs,
      text: toSlack(response),
    });
  } catch (error) {
    log.error('[app_mention] Stream error:', error);
    await slackClient.chat.update({
      channel,
      ts: messageTs,
      text: s.ask.errorGeneric,
    });
  }
}
