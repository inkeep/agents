import { Blocks, Elements, Md, Message } from 'slack-block-builder';
import { SlackStrings } from '../../i18n';

export function createErrorMessage(message: string) {
  return Message()
    .blocks(Blocks.Section().text(`❌ ${message}`))
    .buildToObject();
}

export interface ContextBlockParams {
  agentName: string;
  isPrivate?: boolean;
  sharedBy?: string;
}

export function createContextBlock(params: ContextBlockParams) {
  const { agentName, isPrivate = false, sharedBy } = params;

  let text = SlackStrings.context.poweredBy(agentName);
  if (sharedBy) {
    text = `${SlackStrings.context.sharedBy(sharedBy)} • ${text}`;
  }
  if (isPrivate) {
    text = `${SlackStrings.context.privateResponse} • ${text}`;
  }

  return {
    type: 'context' as const,
    elements: [{ type: 'mrkdwn' as const, text }],
  };
}

export interface ShareButtonsParams {
  channelId: string;
  text: string;
  agentName: string;
  threadTs?: string;
  askAgainMetadata?: {
    teamId: string;
    slackUserId: string;
    tenantId: string;
    messageTs: string;
  };
}

export function buildShareButtons(params: ShareButtonsParams) {
  const { channelId, text, agentName, threadTs, askAgainMetadata } = params;
  const buttons: Array<{
    type: 'button';
    text: { type: 'plain_text'; text: string; emoji: boolean };
    action_id: string;
    value: string;
    style?: 'primary';
  }> = [];

  if (threadTs) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: SlackStrings.buttons.shareToThread, emoji: true },
      action_id: 'share_to_thread',
      style: 'primary',
      value: JSON.stringify({ channelId, threadTs, text, agentName }),
    });
  }

  buttons.push({
    type: 'button',
    text: { type: 'plain_text', text: SlackStrings.buttons.shareToChannel, emoji: true },
    action_id: 'share_to_channel',
    value: JSON.stringify({ channelId, text, agentName }),
  });

  if (askAgainMetadata) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: SlackStrings.buttons.askAgain, emoji: true },
      action_id: 'open_agent_selector_modal',
      value: JSON.stringify({
        channel: channelId,
        threadTs,
        messageTs: askAgainMetadata.messageTs,
        teamId: askAgainMetadata.teamId,
        slackUserId: askAgainMetadata.slackUserId,
        tenantId: askAgainMetadata.tenantId,
      }),
    });
  }

  return buttons;
}

export function createAgentListMessage(
  agents: Array<{ id: string; name: string | null; projectName: string | null }>,
  dashboardUrl: string
) {
  const agentList = agents
    .slice(0, 15)
    .map(
      (a) => `• ${Md.bold(a.name || a.id)} ${a.projectName ? `(${Md.italic(a.projectName)})` : ''}`
    )
    .join('\n');

  const moreText =
    agents.length > 15 ? `\n\n${SlackStrings.agentList.andMore(agents.length - 15)}` : '';

  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold(SlackStrings.agentList.title)}\n\n` +
          agentList +
          moreText +
          '\n\n' +
          `${Md.bold(SlackStrings.agentList.usage)}\n` +
          `• ${SlackStrings.agentList.runUsage}`
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text(SlackStrings.buttons.viewAllInDashboard)
          .url(dashboardUrl)
          .actionId('view_agents')
      )
    )
    .buildToObject();
}

export function createUpdatedHelpMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(`${Md.bold(SlackStrings.help.title)}`),
      Blocks.Section().text(
        `${Md.bold(SlackStrings.help.mentionUsage)}\n\n` +
          `${Md.bold(SlackStrings.help.mentionWithQuestion)} - ${SlackStrings.help.mentionWithQuestionDesc}\n` +
          `• ${SlackStrings.help.mentionWithQuestionDetail}\n\n` +
          `${Md.bold(SlackStrings.help.mentionNoQuestion)} - ${SlackStrings.help.mentionNoQuestionDesc}\n` +
          `• ${SlackStrings.help.mentionNoQuestionChannelDetail}\n` +
          `• ${SlackStrings.help.mentionNoQuestionThreadDetail}`
      ),
      Blocks.Divider(),
      Blocks.Section().text(
        `${Md.bold(SlackStrings.help.slashUsage)}\n\n` +
          `${Md.bold(SlackStrings.help.slashNoArgs)} - ${SlackStrings.help.slashNoArgsDesc}\n` +
          `• ${SlackStrings.help.slashNoArgsDetail}\n\n` +
          `${Md.bold(SlackStrings.help.slashWithQuestion)} - ${SlackStrings.help.slashWithQuestionDesc}\n` +
          `• ${SlackStrings.help.slashWithQuestionDetail}\n\n` +
          `${Md.bold(SlackStrings.help.otherCommands)}\n` +
          `• ${SlackStrings.help.commandRun}\n` +
          `• ${SlackStrings.help.commandList}\n` +
          `• ${SlackStrings.help.commandStatus}\n` +
          `• ${SlackStrings.help.commandLink}\n` +
          `• ${SlackStrings.help.commandHelp}`
      )
    )
    .buildToObject();
}

export function createAlreadyLinkedMessage(email: string, linkedAt: string, dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Already Linked!') +
          '\n\nYour Slack account is already connected to Inkeep.\n\n' +
          Md.bold('Inkeep Account:') +
          ` ${email}\n` +
          Md.bold('Linked:') +
          ` ${new Date(linkedAt).toLocaleDateString()}\n\n` +
          'To switch accounts, first run `/inkeep unlink`'
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text(SlackStrings.buttons.openDashboard)
          .url(dashboardUrl)
          .actionId('open_dashboard')
      )
    )
    .buildToObject();
}

export function createUnlinkSuccessMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Account Unlinked') +
          '\n\nYour Slack account has been disconnected from Inkeep.\n\n' +
          'To use Inkeep agents again, run `/inkeep link` to connect a new account.'
      )
    )
    .buildToObject();
}

export function createNotLinkedMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('❌ Not Linked') +
          '\n\nYour Slack account is not connected to Inkeep.\n\n' +
          'Run `/inkeep link` to connect your account.'
      )
    )
    .buildToObject();
}

export interface AgentConfigSources {
  channelConfig: { agentName?: string; agentId: string } | null;
  workspaceConfig: { agentName?: string; agentId: string } | null;
  effective: { agentName?: string; agentId: string; source: string } | null;
}

export function createStatusMessage(
  email: string,
  linkedAt: string,
  dashboardUrl: string,
  agentConfigs: AgentConfigSources
) {
  const { workspaceConfig, channelConfig, effective } = agentConfigs;

  let agentSection = `\n\n${Md.bold('Agent Configuration')}\n\n`;

  // Workspace default (admin-controlled)
  if (workspaceConfig) {
    agentSection += `${Md.bold('Workspace default:')} ${workspaceConfig.agentName || workspaceConfig.agentId}\n`;
    agentSection += `${Md.italic('(Set by admin in dashboard)')}\n\n`;
  } else {
    agentSection += `${Md.bold('Workspace default:')} Not configured\n`;
    agentSection += `${Md.italic('(Admin can set this in the dashboard)')}\n\n`;
  }

  // Channel override if present
  if (channelConfig) {
    agentSection += `${Md.bold('Channel override:')} ${channelConfig.agentName || channelConfig.agentId}\n`;
    agentSection += `${Md.italic('(This channel uses a specific agent)')}\n\n`;
  }

  // Effective agent
  if (effective) {
    agentSection += `${Md.bold('Active agent:')} ${effective.agentName || effective.agentId}\n`;
  } else {
    agentSection += `${Md.bold('Active agent:')} None configured\n`;
    agentSection += `${Md.italic('Ask your admin to configure a workspace default')}\n`;
  }

  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Connected to Inkeep') +
          `\n\n${Md.bold('Inkeep Account:')} ${email}\n` +
          `${Md.bold('Linked:')} ${new Date(linkedAt).toLocaleDateString()}` +
          agentSection
      ),
      Blocks.Divider(),
      Blocks.Section().text(
        `${Md.bold('Tip:')}\n` +
          '• `@Inkeep` for public responses in channels (visible to everyone)\n' +
          '• `/inkeep` for private responses (only visible to you)'
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text(SlackStrings.buttons.openDashboard)
          .url(dashboardUrl)
          .actionId('open_dashboard')
      )
    )
    .buildToObject();
}

export function createJwtLinkMessage(linkUrl: string, expiresInMinutes: number) {
  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('🔗 Link your Inkeep account')}\n\n` +
          'Connect your Slack and Inkeep accounts to unlock AI-powered assistance:'
      ),
      Blocks.Section().text(
        `${Md.bold('What you can do after linking:')}\n` +
          '• Ask questions with `/inkeep [question]` or `@Inkeep`\n' +
          '• Get personalized responses from AI agents\n' +
          '• Set your own default agent preferences'
      ),
      Blocks.Section().text(
        `${Md.bold('How to link:')}\n` +
          '1. Click the button below\n' +
          '2. Sign in to Inkeep (or create an account)\n' +
          '3. Done! Come back here and start asking questions'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('🔗 Link Account').url(linkUrl).actionId('link_account').primary()
      ),
      Blocks.Context().elements(
        `${Md.emoji('clock')} This link expires in ${expiresInMinutes} minutes`
      )
    )
    .buildToObject();
}
