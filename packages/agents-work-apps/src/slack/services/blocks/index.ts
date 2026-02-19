import { Blocks, Elements, Md, Message } from 'slack-block-builder';
import { z } from 'zod';
import { SlackStrings } from '../../i18n';

export function createErrorMessage(message: string) {
  return Message()
    .blocks(Blocks.Section().text(`❌ ${message}`))
    .buildToObject();
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
  const { responseText, agentName, isError, followUpParams } = params;

  const blocks: any[] = [
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
      Blocks.Header().text(SlackStrings.help.title),
      Blocks.Section().text(SlackStrings.help.publicSection),
      Blocks.Divider(),
      Blocks.Section().text(SlackStrings.help.privateSection),
      Blocks.Divider(),
      Blocks.Section().text(SlackStrings.help.otherCommands),
      Blocks.Divider(),
      Blocks.Context().elements(SlackStrings.help.docsLink)
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
        Md.bold('✅ Connected to Inkeep') +
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

export interface ToolApprovalButtonValue {
  toolCallId: string;
  conversationId: string;
  projectId: string;
  agentId: string;
  slackUserId: string;
  channel: string;
  threadTs: string;
  toolName: string;
}

export const ToolApprovalButtonValueSchema = z.object({
  toolCallId: z.string(),
  conversationId: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  slackUserId: z.string(),
  channel: z.string(),
  threadTs: z.string(),
  toolName: z.string(),
});

export function buildToolApprovalBlocks(params: {
  toolName: string;
  input?: Record<string, unknown>;
  buttonValue: string;
}) {
  const { toolName, input, buttonValue } = params;

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Tool Approval Required', emoji: false },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `The agent wants to use \`${toolName}\`.` },
    },
  ];

  if (input && Object.keys(input).length > 0) {
    const fields = Object.entries(input)
      .slice(0, 10)
      .map(([key, value]) => {
        const valueStr =
          typeof value === 'string'
            ? value.length > 80
              ? `${value.slice(0, 80)}…`
              : value
            : JSON.stringify(value).slice(0, 80);
        return { type: 'mrkdwn', text: `*${key}*\n${valueStr}` };
      });

    blocks.push({ type: 'section', fields });
  }

  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve', emoji: false },
        style: 'primary',
        action_id: 'tool_approval_approve',
        value: buttonValue,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Deny', emoji: false },
        style: 'danger',
        action_id: 'tool_approval_deny',
        value: buttonValue,
      },
    ],
  });

  return blocks;
}

export function buildToolApprovalDoneBlocks(params: {
  toolName: string;
  approved: boolean;
  actorUserId: string;
}) {
  const { toolName, approved, actorUserId } = params;
  const statusText = approved
    ? `✅ Approved \`${toolName}\` · <@${actorUserId}>`
    : `❌ Denied \`${toolName}\` · <@${actorUserId}>`;

  return [{ type: 'context', elements: [{ type: 'mrkdwn', text: statusText }] }];
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
      Blocks.Context().elements(`This link expires in ${expiresInMinutes} minutes`)
    )
    .buildToObject();
}
