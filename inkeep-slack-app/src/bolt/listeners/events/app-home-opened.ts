// ============================================================
// src/bolt/listeners/events/app-home-opened.ts
// Handle App Home tab opened - show status and quick actions
// ============================================================

import type { App } from '@slack/bolt';
import { blocks as b } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';

export function registerAppHomeOpenedEvent(app: App): void {
  app.event('app_home_opened', async ({ event, client, logger }) => {
    // Only handle Home tab
    if (event.tab !== 'home') return;

    try {
      const userId = event.user;

      // Get user display name
      let userName = 'there';
      try {
        const info = await client.users.info({ user: userId });
        const profile = info.user as any;
        userName = profile?.profile?.display_name || profile?.real_name || profile?.name || 'there';
      } catch {
        // Ignore - use default
      }

      const user = await db.getUser(userId);

      const homeBlocks = user.isAuthenticated
        ? buildAuthenticatedHome(userName, user)
        : buildUnauthenticatedHome(userName);

      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: homeBlocks,
        },
      });
    } catch (error) {
      logger.error('[app_home_opened] Error:', error);
    }
  });
}

function buildUnauthenticatedHome(userName: string): any[] {
  return [
    b.header(`👋 Welcome, ${userName}!`),
    b.divider(),
    b.text('Connect your Inkeep account to start chatting with AI agents.'),
    b.divider(),
    b.actions(b.button(s.auth.loginButton, 'auth_login', 'login', 'primary')),
    b.context(s.auth.loginFooter),
  ];
}

function buildAuthenticatedHome(userName: string, user: any): any[] {
  const hasDefault = user.settings?.defaultAgentId && user.settings?.defaultProjectId;

  return [
    b.header(`👋 Welcome back, ${userName}!`),
    b.divider(),
    b.text('✅ *Connected to Inkeep*'),
    b.divider(),

    // Quick actions
    b.text('*⚡ Quick Actions*'),
    b.actions(b.button('💬 Ask a Question', 'ask_open_modal', '', 'primary')),
    b.divider(),

    // Default agent status
    b.text('*🤖 Your Default Agent*'),
    hasDefault
      ? b.text(`Agent ID: \`${user.settings.defaultAgentId}\``)
      : b.text('_No default agent set. Use `/inkeep` to ask a question and select one._'),
    b.divider(),

    // Help
    b.text('*📖 Commands*'),
    b.text(
      '`/inkeep` — Ask a question (private → DM)\n' +
        '`@Inkeep <question>` — Ask in channel (public)\n' +
        '`/inkeep status` — View configuration\n' +
        '`/inkeep default` — Set channel default'
    ),
    b.divider(),
    b.context('💡 Use `/inkeep help` for more commands'),
  ];
}
