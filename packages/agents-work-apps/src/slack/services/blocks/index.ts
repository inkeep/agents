import { Blocks, Elements, Md, Message } from 'slack-block-builder';
import { SlackStrings } from '../../i18n';

export function createErrorMessage(message: string) {
  return Message().blocks(Blocks.Section().text(message)).buildToObject();
}

export interface ContextBlockParams {
  agentName: string;
  isPrivate?: boolean;
}

export function createContextBlock(params: ContextBlockParams) {
  const { agentName, isPrivate = false } = params;

  let text = SlackStrings.context.poweredBy(agentName);
  if (isPrivate) {
    text = `${SlackStrings.context.privateResponse} • ${text}`;
  }

  return {
    type: 'context' as const,
    elements: [{ type: 'mrkdwn' as const, text }],
  };
}

export interface FollowUpButtonParams {
  conversationId: string;
  agentId: string;
  projectId: string;
  tenantId: string;
  teamId: string;
  slackUserId: string;
  channel: string;
}

export function buildFollowUpButton(params: FollowUpButtonParams) {
  return [
    {
      type: 'button' as const,
      text: { type: 'plain_text' as const, text: SlackStrings.buttons.followUp, emoji: true },
      action_id: 'open_follow_up_modal',
      value: JSON.stringify(params),
    },
  ];
}

/**
 * Build Block Kit blocks for a private conversational response.
 * Shows the user's message, a divider, the agent response, context, and a Follow Up button.
 */
export function buildConversationResponseBlocks(params: {
  userMessage: string;
  responseText: string;
  agentName: string;
  isError: boolean;
  followUpParams: FollowUpButtonParams;
}) {
  const { userMessage, responseText, agentName, isError, followUpParams } = params;

  // Truncate user message for display (Slack section text max is 3000 chars)
  const displayMessage = userMessage.length > 200 ? `${userMessage.slice(0, 200)}...` : userMessage;

  const blocks: any[] = [
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*You:* ${displayMessage}` }],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: responseText },
    },
  ];

  if (!isError) {
    const contextBlock = createContextBlock({ agentName, isPrivate: true });
    blocks.push(contextBlock);
    blocks.push({ type: 'actions', elements: buildFollowUpButton(followUpParams) });
  }

  return blocks;
}

export function createUpdatedHelpMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(`${Md.bold(SlackStrings.help.title)}`),
      Blocks.Section().text(SlackStrings.help.publicSection),
      Blocks.Divider(),
      Blocks.Section().text(SlackStrings.help.privateSection),
      Blocks.Divider(),
      Blocks.Section().text(SlackStrings.help.otherCommands),
      Blocks.Divider(),
      Blocks.Section().text(SlackStrings.help.docsLink)
    )
    .buildToObject();
}

export function createAlreadyLinkedMessage(email: string, linkedAt: string, dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('Already linked') +
          '\n\nYour Slack account is connected to Inkeep.\n\n' +
          Md.bold('Account:') +
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
        Md.bold('Account unlinked') +
          '\n\nYour Slack account has been disconnected from Inkeep.\n\n' +
          'Run `/inkeep link` to connect a new account.'
      )
    )
    .buildToObject();
}

export function createNotLinkedMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('Not linked') +
          '\n\nYour Slack account is not connected to Inkeep. Run `/inkeep link` to connect.'
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
  const { effective } = agentConfigs;

  let agentLine: string;
  if (effective) {
    agentLine = `${Md.bold('Agent:')} ${effective.agentName || effective.agentId}`;
  } else {
    agentLine =
      `${Md.bold('Agent:')} None configured\n` +
      `${Md.italic('Ask your admin to set up an agent in the dashboard.')}`;
  }

  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('Connected to Inkeep') +
          `\n\n${Md.bold('Account:')} ${email}\n` +
          `${Md.bold('Linked:')} ${new Date(linkedAt).toLocaleDateString()}\n` +
          agentLine
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
        `${Md.bold('Link your Inkeep account')}\n\n` +
          'Connect your Slack and Inkeep accounts to use Inkeep agents.'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('Link Account').url(linkUrl).actionId('link_account').primary()
      ),
      Blocks.Context().elements(`This link expires in ${expiresInMinutes} minutes.`)
    )
    .buildToObject();
}
