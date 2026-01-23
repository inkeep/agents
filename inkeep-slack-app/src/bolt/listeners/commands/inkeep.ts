// ============================================================
// src/bolt/listeners/commands/inkeep.ts
// /inkeep command handler with subcommands
// ============================================================

import type { AckFn, AllMiddlewareArgs, App, RespondFn, SlashCommand } from '@slack/bolt';
import { blocks as b, encode } from '@/lib/blocks';
import { db } from '@/lib/db';
import { strings as s } from '@/lib/strings';
import { formatDate } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface CommandContext {
  command: SlashCommand;
  ack: AckFn<string>;
  respond: RespondFn;
  client: AllMiddlewareArgs['client'];
  logger: AllMiddlewareArgs['logger'];
}

// ============================================================
// Subcommand Handlers
// ============================================================

async function handleLogin(ctx: CommandContext): Promise<void> {
  const { command, respond, logger } = ctx;

  try {
    const user = await db.getUser(command.user_id);

    if (user.isAuthenticated) {
      await respond({ response_type: 'ephemeral', text: s.auth.alreadyConnected });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      blocks: [
        b.header(s.auth.loginHeader),
        b.divider(),
        b.text(s.auth.loginDescription),
        b.divider(),
        b.actions(b.button(s.auth.loginButton, 'auth_login', 'login', 'primary')),
        b.context(s.auth.loginFooter),
      ],
    });
  } catch (error) {
    logger.error('[/inkeep login] Error:', error);
    await respond({
      response_type: 'ephemeral',
      text: 'Failed to process login. Please try again.',
    });
  }
}

async function handleLogout(ctx: CommandContext): Promise<void> {
  const { command, respond, logger } = ctx;

  try {
    await db.logoutUser(command.user_id);
    await respond({ response_type: 'ephemeral', text: s.auth.logoutSuccess });
  } catch (error) {
    logger.error('[/inkeep logout] Error:', error);
    await respond({ response_type: 'ephemeral', text: 'Failed to logout. Please try again.' });
  }
}

async function handleStatus(ctx: CommandContext): Promise<void> {
  const { command, respond, client, logger } = ctx;

  try {
    const [user, config] = await Promise.all([
      db.getUser(command.user_id),
      db.getChannelConfig(command.channel_id),
    ]);

    // Get channel name
    let channelName = 'this-channel';
    try {
      const info = await client.conversations.info({ channel: command.channel_id });
      channelName = info.channel?.name || channelName;
    } catch {
      // Ignore - use default
    }

    if (!user.isAuthenticated) {
      await respond({ response_type: 'ephemeral', text: s.auth.notConnected });
      return;
    }

    if (!config) {
      await respond({
        response_type: 'ephemeral',
        blocks: [
          b.header(s.status.connectedHeader),
          b.divider(),
          b.text(s.status.noConfig(channelName)),
          b.text(s.status.noConfigPrompt),
          b.divider(),
          b.actions(
            b.button('Configure Default', 'config_start', command.channel_id, 'primary'),
            b.button('Ask a Question', 'ask_open_modal', '', 'primary')
          ),
        ],
      });
      return;
    }

    const [project, agent] = await Promise.all([
      db.getProject(config.projectId),
      db.getAgent(config.agentId, config.projectId),
    ]);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        b.header(s.status.channelHeader(channelName)),
        b.divider(),
        b.fields(
          [s.labels.project, project?.name || 'Unknown'],
          [s.labels.defaultAgent, agent?.name || 'Unknown']
        ),
        b.context(s.status.configuredBy(config.configuredBy, formatDate(config.configuredAt))),
        b.divider(),
        b.actions(
          b.button(s.buttons.change, 'config_start', command.channel_id),
          b.button('Ask a Question', 'ask_open_modal', '')
        ),
      ],
    });
  } catch (error) {
    logger.error('[/inkeep status] Error:', error);
    await respond({ response_type: 'ephemeral', text: 'Failed to get status. Please try again.' });
  }
}

async function handleHelp(ctx: CommandContext): Promise<void> {
  const { respond, logger } = ctx;

  try {
    await respond({
      response_type: 'ephemeral',
      blocks: [
        b.header(s.help.header),
        b.divider(),
        b.text(s.help.commands),
        b.divider(),
        b.context(s.help.footer),
      ],
    });
  } catch (error) {
    logger.error('[/inkeep help] Error:', error);
    await respond({ response_type: 'ephemeral', text: 'Failed to show help.' });
  }
}

async function handleDefault(ctx: CommandContext): Promise<void> {
  const { command, respond, client, logger } = ctx;

  try {
    // Check if user is admin
    let isAdmin = false;
    try {
      const info = await client.users.info({ user: command.user_id });
      isAdmin = info.user?.is_admin === true || info.user?.is_owner === true;
    } catch {
      // Ignore - treat as non-admin
    }

    if (!isAdmin) {
      await respond({ response_type: 'ephemeral', text: s.config.adminOnly });
      return;
    }

    // Get channel name
    let channelName = 'this-channel';
    try {
      const info = await client.conversations.info({ channel: command.channel_id });
      channelName = info.channel?.name || channelName;
    } catch {
      // Ignore - use default
    }

    const projects = await db.getProjects();

    await respond({
      response_type: 'ephemeral',
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
                encode({ projectId: p.id, channelId: command.channel_id, channelName })
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
                    value: encode({ projectId: p.id, channelId: command.channel_id, channelName }),
                  }))
                )
              ),
            ]
          : []),
      ],
    });
  } catch (error) {
    logger.error('[/inkeep default] Error:', error);
    await respond({ response_type: 'ephemeral', text: 'Failed to start configuration.' });
  }
}

async function handleAsk(ctx: CommandContext, prefilled: string): Promise<void> {
  const { command, client, respond, logger } = ctx;

  try {
    const user = await db.getUser(command.user_id);

    if (!user.isAuthenticated) {
      await handleLogin(ctx);
      return;
    }

    const projects = await db.getProjects();

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'ask_modal_submit',
        private_metadata: encode({ channelId: command.channel_id, prefilled }),
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
          ...(prefilled
            ? [
                b.input('question_block', s.ask.questionLabel, 'question_input', {
                  placeholder: s.ask.questionPlaceholder,
                  multiline: true,
                  initialValue: prefilled,
                }),
              ]
            : []),
        ],
      },
    });
  } catch (error) {
    logger.error('[/inkeep ask] Error:', error);
    await respond({ response_type: 'ephemeral', text: 'Failed to open ask modal.' });
  }
}

// ============================================================
// Command Router
// ============================================================

export function registerInkeepCommand(app: App): void {
  app.command('/inkeep', async ({ command, ack, respond, client, logger }) => {
    // Acknowledge immediately to avoid timeout
    await ack();

    const ctx: CommandContext = { command, ack, respond, client, logger };
    const text = command.text?.trim() || '';
    const args = text.split(/\s+/);
    const subcommand = args[0]?.toLowerCase() || '';

    logger.debug(`[/inkeep] user=${command.user_id} subcommand="${subcommand || 'help'}"`);

    switch (subcommand) {
      case 'login':
        return handleLogin(ctx);
      case 'logout':
        return handleLogout(ctx);
      case 'status':
        return handleStatus(ctx);
      case 'help':
        return handleHelp(ctx);
      case 'default':
        return handleDefault(ctx);
      default:
        // If there's text but not a known subcommand, treat as question
        if (text) {
          return handleAsk(ctx, text);
        }
        // No text = show help
        return handleHelp(ctx);
    }
  });
}
