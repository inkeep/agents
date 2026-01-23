// ============================================================
// src/bolt/listeners/views/ask-modal.ts
// Ask modal submission handler
// ============================================================

import type { App } from '@slack/bolt';
import { decode } from '@/lib/blocks';
import type { AskModalMetadata } from '@/lib/types';

export function registerAskModalView(app: App): void {
  // Handle Ask modal submission
  app.view('ask_modal_submit', async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
      const userId = body.user.id;
      const metadata: AskModalMetadata = decode(view.private_metadata || '{}');

      // Extract form values
      const values = view.state.values;
      const question = values.question_block?.question_input?.value;
      const agentValue = values.agent_block?.agent_select?.selected_option?.value;
      const projectId = values.project_block?.ask_modal_select_project?.selected_option?.value;

      if (!question) {
        logger.warn('[ask_modal_submit] No question provided');
        return;
      }

      // Parse agent selection if present
      let agentInfo: {
        agentId: string;
        projectId: string;
        agentName: string;
        projectName: string;
      } | null = null;
      if (agentValue) {
        agentInfo = decode(agentValue);
      }

      logger.info(
        `[ask_modal_submit] user=${userId} project=${projectId || agentInfo?.projectId} agent=${agentInfo?.agentId}`
      );

      // Determine where to send the response
      const channelId = metadata.channelId || userId;

      // Send initial response
      await client.chat.postMessage({
        channel: channelId,
        text: `*Your question:* ${question}\n\n_Processing..._`,
      });

      // TODO: Call agents-run-api with:
      // - question
      // - agentInfo?.agentId
      // - agentInfo?.projectId || projectId
      // - userId
      // - channelId
    } catch (error) {
      logger.error('[ask_modal_submit] Error:', error);
    }
  });
}
