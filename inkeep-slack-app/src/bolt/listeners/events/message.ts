// ============================================================
// src/bolt/listeners/events/message.ts
// Handle messages in DM threads for conversation continuity
// ============================================================

import type { App } from '@slack/bolt';

import { db } from '@/lib/db';
import { STREAM_CONFIG } from '@/lib/env';
import { askInkeep } from '@/lib/inkeep';
import { strings as s } from '@/lib/strings';
import { isDupe, sleep, toSlack } from '@/lib/utils';

export function registerMessageEvent(app: App): void {
  app.event('message', async ({ event, client, logger }) => {
    // Type guard for message events
    const msg = event as {
      bot_id?: string;
      subtype?: string;
      thread_ts?: string;
      channel: string;
      text?: string;
      ts: string;
      client_msg_id?: string;
    };

    // Ignore bot messages, subtypes (edits, deletes, etc.)
    if (msg.bot_id || msg.subtype) return;

    // Only handle thread replies
    if (!msg.thread_ts) return;

    const { channel, text, thread_ts: threadTs, ts, client_msg_id } = msg;

    // Deduplicate
    const eventId = client_msg_id || `msg-${channel}-${ts}`;
    if (isDupe(eventId)) return;

    // Check if this thread is tracked (i.e., it's a conversation with Inkeep)
    const threadData = await db.getThread(channel, threadTs);
    if (!threadData) return;

    const { thread } = threadData as {
      thread: { conversationId?: string; agentId: string; projectId: string };
    };

    // Only auto-respond in DMs (channels require @mention - handled by app_mention)
    const isDM = channel.startsWith('D');
    if (!isDM) return;

    // Post thinking message
    const thinkingMsg = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: s.ask.thinking,
    });

    const messageTs = thinkingMsg.ts;
    if (!messageTs) {
      logger.error('[message] No ts returned from postMessage');
      return;
    }

    // Use existing conversation ID for context
    const conversationId =
      thread.conversationId || `thread-${channel}-${threadTs}-${thread.agentId}`;

    let lastUpdate = 0;
    let lastLen = 0;

    try {
      const response = await askInkeep(
        text || 'Please continue',
        conversationId,
        thread.projectId,
        thread.agentId,
        async (fullText) => {
          const now = Date.now();
          if (now - lastUpdate < STREAM_CONFIG.throttleMs) return;
          if (fullText.length - lastLen < STREAM_CONFIG.minDeltaChars) return;

          try {
            await client.chat.update({
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
      await client.chat.update({
        channel,
        ts: messageTs,
        text: toSlack(response),
      });
    } catch (error) {
      logger.error('[message] Stream error:', error);
      await client.chat.update({
        channel,
        ts: messageTs,
        text: s.ask.errorGeneric,
      });
    }
  });
}
