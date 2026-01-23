// ============================================================
// src/bolt/listeners/shortcuts/ask-inkeep.ts
// Message and global shortcuts for asking Inkeep
// ============================================================

import type { App } from '@slack/bolt';
import { encode } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';
import type { AskModalMetadata } from '@/lib/types';
import { truncate } from '@/lib/utils';

export function registerAskInkeepShortcut(app: App): void {
  // Message shortcut - right-click "Ask Inkeep" on any message
  app.shortcut('ask_inkeep_message', async ({ ack, shortcut, client, logger }) => {
    await ack();

    try {
      const userId = shortcut.user.id;
      const user = await db.getUser(userId);

      if (!user.isAuthenticated) {
        await showLoginRequiredModal(client, shortcut.trigger_id);
        return;
      }

      // Get message context from the shortcut payload
      const messageShortcut = shortcut as any;
      const messageText = messageShortcut.message?.text || '';
      const channelId = messageShortcut.channel?.id || '';

      const projects = await db.getProjects();

      const metadata: AskModalMetadata = {
        channelId,
        messageContext: truncate(messageText, 500),
      };

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'ask_modal_submit',
          private_metadata: encode(metadata),
          title: { type: 'plain_text', text: 'Ask Inkeep' },
          submit: { type: 'plain_text', text: s.buttons.ask },
          close: { type: 'plain_text', text: s.buttons.cancel },
          blocks: [
            // Show message context
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${s.shortcut.contextLabel}:*\n> ${truncate(messageText, 300) || '_No text_'}`,
              },
            },
            { type: 'divider' },

            // Project selector
            {
              type: 'input',
              block_id: 'project_block',
              dispatch_action: true,
              label: { type: 'plain_text', text: s.ask.projectLabel },
              element: {
                type: 'static_select',
                action_id: 'ask_modal_select_project',
                placeholder: { type: 'plain_text', text: s.selectors.projectPlaceholder },
                options: projects.slice(0, 100).map((p) => ({
                  text: { type: 'plain_text', text: p.name.slice(0, 75) },
                  value: p.id,
                })),
              },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: '👆 Select a project to see agents' }],
            },
          ],
        },
      });
    } catch (error) {
      logger.error('[ask_inkeep_message] Error:', error);
    }
  });

  // Global shortcut - keyboard shortcut or search "Ask Inkeep"
  app.shortcut('ask_inkeep_global', async ({ ack, shortcut, client, logger }) => {
    await ack();

    try {
      const userId = shortcut.user.id;
      const user = await db.getUser(userId);

      if (!user.isAuthenticated) {
        await showLoginRequiredModal(client, shortcut.trigger_id);
        return;
      }

      const projects = await db.getProjects();

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'ask_modal_submit',
          private_metadata: encode({ channelId: '' } as AskModalMetadata),
          title: { type: 'plain_text', text: s.ask.modalTitle },
          submit: { type: 'plain_text', text: s.buttons.ask },
          close: { type: 'plain_text', text: s.buttons.cancel },
          blocks: [
            {
              type: 'input',
              block_id: 'project_block',
              dispatch_action: true,
              label: { type: 'plain_text', text: s.ask.projectLabel },
              element: {
                type: 'static_select',
                action_id: 'ask_modal_select_project',
                placeholder: { type: 'plain_text', text: s.selectors.projectPlaceholder },
                options: projects.slice(0, 100).map((p) => ({
                  text: { type: 'plain_text', text: p.name.slice(0, 75) },
                  value: p.id,
                })),
              },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: '👆 Select a project to see agents' }],
            },
          ],
        },
      });
    } catch (error) {
      logger.error('[ask_inkeep_global] Error:', error);
    }
  });
}

/**
 * Show modal prompting user to login first
 */
async function showLoginRequiredModal(client: any, triggerId: string): Promise<void> {
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'Connect First' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: s.auth.notConnected },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'Run `/inkeep login` to get started.' },
        },
      ],
    },
  });
}
