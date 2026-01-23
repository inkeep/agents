// ============================================================
// src/bolt/listeners/actions/auth.ts
// Authentication action handlers
// ============================================================

import type { App } from '@slack/bolt';
import { blocks as b } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';

export function registerAuthActions(app: App): void {
  // Login button clicked
  app.action('auth_login', async ({ ack, body, respond, logger }) => {
    await ack();

    try {
      const userId = body.user.id;
      const result = await db.loginUser(userId);
      const projects = await db.getProjects();

      if (!projects?.length) {
        await respond({
          replace_original: true,
          text: `${s.auth.loginSuccess} No projects found yet.`,
        });
        return;
      }

      await respond({
        replace_original: true,
        blocks: [
          b.header(s.auth.loginSuccess),
          b.context(
            `:office: *${result.org || 'Your Organization'}*`,
            `:file_folder: ${projects.length} projects`
          ),
          b.divider(),
          b.text('*Quick select a project to start a conversation:*'),
          b.actions(
            ...projects.slice(0, 5).map((p) => b.button(p.name, `select_project:${p.id}`, p.id))
          ),
          b.context('💡 Use `/inkeep` anytime to ask a question'),
        ],
      });
    } catch (error) {
      logger.error('[auth_login] Error:', error);
      await respond({
        replace_original: true,
        text: 'Failed to complete login. Please try again.',
      });
    }
  });
}
