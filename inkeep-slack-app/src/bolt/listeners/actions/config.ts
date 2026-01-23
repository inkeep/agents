// ============================================================
// src/bolt/listeners/actions/config.ts
// Channel configuration action handlers
// ============================================================

import type { App } from '@slack/bolt';
import { blocks as b, decode, encode } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';

// ============================================================
// Types
// ============================================================

interface ConfigPayload {
  projectId: string;
  channelId: string;
  channelName: string;
  projectName?: string;
}

interface AgentConfigPayload extends ConfigPayload {
  agentId: string;
  agentName: string;
}

// ============================================================
// Handlers
// ============================================================

export function registerConfigActions(app: App): void {
  // Start config flow (from status command)
  app.action('config_start', async ({ ack, body, respond, client, logger }) => {
    await ack();

    try {
      const channelId = (body as any).actions?.[0]?.value;

      // Get channel name
      let channelName = 'this-channel';
      try {
        const info = await client.conversations.info({ channel: channelId });
        channelName = info.channel?.name || channelName;
      } catch {
        // Ignore - use default
      }

      const projects = await db.getProjects();

      await respond({
        replace_original: true,
        blocks: [
          b.header(s.config.header(channelName)),
          b.divider(),
          b.text(s.config.selectProject),
          b.actions(
            ...projects
              .slice(0, 5)
              .map((p) =>
                b.button(
                  p.name,
                  'config_select_project',
                  encode({ projectId: p.id, channelId, channelName })
                )
              )
          ),
          ...(projects.length > 5
            ? [
                b.textWithAccessory(
                  `_Or choose from all ${projects.length} projects:_`,
                  b.select(
                    s.selectors.projectPlaceholder,
                    'config_select_project_dropdown',
                    projects.map((p) => ({
                      label: p.name,
                      value: encode({ projectId: p.id, channelId, channelName }),
                    }))
                  )
                ),
              ]
            : []),
        ],
      });
    } catch (error) {
      logger.error('[config_start] Error:', error);
    }
  });

  // Project selected - show agents
  app.action('config_select_project', async ({ ack, body, respond, logger }) => {
    await ack();

    try {
      const value = (body as any).actions?.[0]?.value;
      const payload: ConfigPayload = decode(value);

      const [project, agents] = await Promise.all([
        db.getProject(payload.projectId),
        db.getAgents(payload.projectId),
      ]);

      if (agents.length === 0) {
        await respond({
          replace_original: true,
          blocks: [
            b.header(s.selectors.agentHeader),
            b.context(`:file_folder: ${project.name}`),
            b.divider(),
            b.text(s.selectors.noAgents),
            b.divider(),
            b.actions(b.button(s.selectors.backToProjects, 'config_start', payload.channelId)),
          ],
        });
        return;
      }

      const extendedPayload: ConfigPayload = { ...payload, projectName: project.name };

      await respond({
        replace_original: true,
        blocks: [
          b.header(s.selectors.agentHeader),
          b.context(`:file_folder: ${project.name}`),
          b.divider(),
          b.text(s.config.selectAgent),
          b.actions(
            ...agents
              .slice(0, 5)
              .map((a) =>
                b.button(
                  a.name,
                  'config_select_agent',
                  encode({ ...extendedPayload, agentId: a.id, agentName: a.name })
                )
              )
          ),
          ...(agents.length > 5
            ? [
                b.textWithAccessory(
                  `_Or choose from all ${agents.length} agents:_`,
                  b.select(
                    s.selectors.agentPlaceholder,
                    'config_select_agent_dropdown',
                    agents.map((a) => ({
                      label: a.name,
                      value: encode({ ...extendedPayload, agentId: a.id, agentName: a.name }),
                    }))
                  )
                ),
              ]
            : []),
          b.divider(),
          b.actions(b.button(s.selectors.backToProjects, 'config_start', payload.channelId)),
        ],
      });
    } catch (error) {
      logger.error('[config_select_project] Error:', error);
    }
  });

  // Handle dropdown selection for project
  app.action('config_select_project_dropdown', async ({ ack, body, respond, logger }) => {
    await ack();

    try {
      const value = (body as any).actions?.[0]?.selected_option?.value;
      if (!value) return;

      const payload: ConfigPayload = decode(value);

      const [project, agents] = await Promise.all([
        db.getProject(payload.projectId),
        db.getAgents(payload.projectId),
      ]);

      const extendedPayload: ConfigPayload = { ...payload, projectName: project.name };

      await respond({
        replace_original: true,
        blocks: [
          b.header(s.selectors.agentHeader),
          b.context(`:file_folder: ${project.name}`),
          b.divider(),
          b.text(s.config.selectAgent),
          b.actions(
            ...agents
              .slice(0, 5)
              .map((a) =>
                b.button(
                  a.name,
                  'config_select_agent',
                  encode({ ...extendedPayload, agentId: a.id, agentName: a.name })
                )
              )
          ),
          b.divider(),
          b.actions(b.button(s.selectors.backToProjects, 'config_start', payload.channelId)),
        ],
      });
    } catch (error) {
      logger.error('[config_select_project_dropdown] Error:', error);
    }
  });

  // Agent selected - save config
  app.action('config_select_agent', async ({ ack, body, respond, logger }) => {
    await ack();

    try {
      const value = (body as any).actions?.[0]?.value;
      const payload: AgentConfigPayload = decode(value);
      const userId = body.user.id;

      await db.setChannelConfig(payload.channelId, {
        projectId: payload.projectId,
        agentId: payload.agentId,
        configuredBy: userId,
        channelName: payload.channelName,
      });

      await respond({
        replace_original: true,
        blocks: [
          b.text(s.config.success(payload.channelName, payload.agentName)),
          b.context('Anyone can now use `@Inkeep <question>` in this channel.'),
        ],
      });
    } catch (error) {
      logger.error('[config_select_agent] Error:', error);
    }
  });

  // Handle dropdown selection for agent
  app.action('config_select_agent_dropdown', async ({ ack, body, respond, logger }) => {
    await ack();

    try {
      const value = (body as any).actions?.[0]?.selected_option?.value;
      if (!value) return;

      const payload: AgentConfigPayload = decode(value);
      const userId = body.user.id;

      await db.setChannelConfig(payload.channelId, {
        projectId: payload.projectId,
        agentId: payload.agentId,
        configuredBy: userId,
        channelName: payload.channelName,
      });

      await respond({
        replace_original: true,
        blocks: [
          b.text(s.config.success(payload.channelName, payload.agentName)),
          b.context('Anyone can now use `@Inkeep <question>` in this channel.'),
        ],
      });
    } catch (error) {
      logger.error('[config_select_agent_dropdown] Error:', error);
    }
  });
}
