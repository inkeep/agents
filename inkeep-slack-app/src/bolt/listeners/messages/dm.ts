// ============================================================
// src/bolt/listeners/messages/dm.ts
// Handle direct messages (non-thread initial messages)
//
// Note: Thread replies in DMs are handled by events/message.ts
// This handles the initial DM when someone messages the bot directly
// ============================================================

import type { App } from '@slack/bolt';

import { blocks as b } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';

export function registerDmHandler(app: App): void {
  // Handle direct messages (not in threads)
  app.message(async ({ message, say, logger }) => {
    // Only handle direct messages
    if (message.channel_type !== 'im') return;

    // Ignore bot messages to prevent loops
    if ('bot_id' in message) return;

    // Ignore thread replies (handled by events/message.ts)
    if ('thread_ts' in message && message.thread_ts) return;

    const text = 'text' in message ? message.text : '';
    const userId = 'user' in message ? message.user : undefined;

    if (!text || !userId) return;

    logger.debug(`[DM] user=${userId} message="${text.slice(0, 50)}..."`);

    try {
      const user = await db.getUser(userId);

      // If not authenticated, prompt to login
      if (!user.isAuthenticated) {
        await say({
          blocks: [
            b.text(s.auth.notConnected),
            b.divider(),
            b.text('Run `/inkeep login` to connect your account and start asking questions.'),
          ],
        });
        return;
      }

      // Check if user has a default agent configured
      const hasDefault = user.settings?.defaultAgentId && user.settings?.defaultProjectId;

      if (hasDefault) {
        // User has default - process the question directly
        await say({ text: s.ask.thinking });

        // TODO: Call askInkeep with default agent
        // For now, prompt to use the full flow
        await say({
          text: 'I received your question! Use `/inkeep` for the full experience with agent selection.',
        });
        return;
      }

      // No default agent - prompt to select one
      const projects = await db.getProjects();

      if (!projects.length) {
        await say({ text: 'No projects found. Please contact your administrator.' });
        return;
      }

      await say({
        blocks: [
          b.text("👋 I'd be happy to help! First, let's select a project and agent."),
          b.divider(),
          b.text('*Quick select a project:*'),
          b.actions(
            ...projects.slice(0, 5).map((p) => b.button(p.name, `dm_select_project:${p.id}`, p.id))
          ),
          b.context('💡 Or use `/inkeep` for the full experience'),
        ],
      });
    } catch (error) {
      logger.error('[DM] Error:', error);
      await say({ text: s.ask.errorGeneric });
    }
  });
}
