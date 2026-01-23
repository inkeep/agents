// ============================================================
// src/bolt/listeners/actions/ask.ts
// Ask modal action handlers
// ============================================================

import type { App } from '@slack/bolt';
import { blocks as b, decode, encode } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';
import type { AskModalMetadata } from '@/lib/types';

export function registerAskActions(app: App): void {
  // Open ask modal from button
  app.action('ask_open_modal', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const triggerId = (body as any).trigger_id;
      const channelId = (body as any).channel?.id || '';
      const projects = await db.getProjects();

      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'ask_modal_submit',
          private_metadata: encode({ channelId } as AskModalMetadata),
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
            b.context('👆 Select a project to see agents'),
          ],
        },
      });
    } catch (error) {
      logger.error('[ask_open_modal] Error:', error);
    }
  });

  // Project selected in ask modal - update to show agents
  app.action('ask_modal_select_project', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const view = (body as any).view;
      const viewId = view?.id;
      const metadata: AskModalMetadata = decode(view?.private_metadata || '{}');

      const action = (body as any).actions?.[0];
      const projectId = action?.selected_option?.value;

      if (!viewId || !projectId) return;

      const [projects, agents, project] = await Promise.all([
        db.getProjects(),
        db.getAgents(projectId),
        db.getProject(projectId),
      ]);

      const updatedMetadata: AskModalMetadata = { ...metadata };

      const newBlocks: any[] = [
        {
          type: 'input',
          block_id: 'project_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: s.ask.projectLabel },
          element: {
            type: 'static_select',
            action_id: 'ask_modal_select_project',
            placeholder: { type: 'plain_text', text: s.selectors.projectPlaceholder },
            initial_option: {
              text: { type: 'plain_text', text: project.name.slice(0, 75) },
              value: projectId,
            },
            options: projects.slice(0, 100).map((p) => ({
              text: { type: 'plain_text', text: p.name.slice(0, 75) },
              value: p.id,
            })),
          },
        },
      ];

      if (agents.length > 0) {
        newBlocks.push({
          type: 'input',
          block_id: 'agent_block',
          label: { type: 'plain_text', text: s.ask.agentLabel },
          element: {
            type: 'static_select',
            action_id: 'agent_select',
            placeholder: { type: 'plain_text', text: s.selectors.agentPlaceholder },
            options: agents.map((a) => ({
              text: { type: 'plain_text', text: a.name.slice(0, 75) },
              value: encode({
                agentId: a.id,
                projectId,
                agentName: a.name,
                projectName: project.name,
              }),
            })),
          },
        });

        newBlocks.push(
          b.input('question_block', s.ask.questionLabel, 'question_input', {
            placeholder: s.ask.questionPlaceholder,
            multiline: true,
            initialValue: metadata.prefilled,
          })
        );
      } else {
        newBlocks.push(b.context(s.selectors.noAgents));
      }

      await client.views.update({
        view_id: viewId,
        view: {
          type: 'modal',
          callback_id: 'ask_modal_submit',
          private_metadata: encode(updatedMetadata),
          title: { type: 'plain_text', text: s.ask.modalTitle },
          submit: agents.length > 0 ? { type: 'plain_text', text: s.buttons.ask } : undefined,
          close: { type: 'plain_text', text: s.buttons.cancel },
          blocks: newBlocks,
        },
      });
    } catch (error) {
      logger.error('[ask_modal_select_project] Error:', error);
    }
  });
}
