import { Blocks, Elements, Md, Message } from 'slack-block-builder';
import { z } from 'zod';
import { SlackStrings } from '../../i18n';
import { escapeSlackLinkText, escapeSlackMrkdwn } from '../events/utils';

export function createErrorMessage(message: string) {
  return Message().blocks(Blocks.Section().text(message)).buildToObject();
}

export interface ContextBlockParams {
  agentName: string;
  isPrivate?: boolean;
}

export function createContextBlock(params: ContextBlockParams) {
  const { agentName, isPrivate = false } = params;

  let text = SlackStrings.context.poweredBy(escapeSlackMrkdwn(agentName));
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
      type: 'section',
      text: { type: 'mrkdwn', text: `*Approval required - \`${escapeSlackMrkdwn(toolName)}\`*` },
    },
  ];

  if (input && Object.keys(input).length > 0) {
    const fields = Object.entries(input)
      .slice(0, 10)
      .map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        const truncated = val.length > 80 ? `${val.slice(0, 80)}…` : val;
        return {
          type: 'mrkdwn',
          text: `*${escapeSlackMrkdwn(k)}:*\n${escapeSlackMrkdwn(truncated)}`,
        };
      });
    blocks.push({ type: 'section', fields });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve', emoji: true },
        style: 'primary',
        action_id: 'tool_approval_approve',
        value: buttonValue,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Deny', emoji: true },
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
    ? `✅ Approved \`${escapeSlackMrkdwn(toolName)}\` · <@${actorUserId}>`
    : `❌ Denied \`${escapeSlackMrkdwn(toolName)}\` · <@${actorUserId}>`;

  return [{ type: 'context', elements: [{ type: 'mrkdwn', text: statusText }] }];
}

export function buildToolApprovalExpiredBlocks(params: { toolName: string }) {
  return [
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `⏱️ Expired · \`${escapeSlackMrkdwn(params.toolName)}\`` }],
    },
  ];
}

export function buildToolOutputErrorBlock(toolName: string, errorText: string) {
  const truncated = errorText.length > 100 ? `${errorText.slice(0, 100)}…` : errorText;
  return {
    type: 'context' as const,
    elements: [
      {
        type: 'mrkdwn' as const,
        text: `⚠️ *${escapeSlackMrkdwn(toolName)}* · failed: ${escapeSlackMrkdwn(truncated)}`,
      },
    ],
  };
}

export function buildSummaryBreadcrumbBlock(labels: string[]) {
  return {
    type: 'context' as const,
    elements: [{ type: 'mrkdwn' as const, text: labels.map(escapeSlackMrkdwn).join(' → ') }],
  };
}

function isFlatRecord(obj: Record<string, unknown>): boolean {
  return Object.values(obj).every(
    (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
  );
}

function findSourcesArray(
  data: Record<string, unknown>
): Array<{ url?: string; href?: string; title?: string; name?: string }> | null {
  for (const value of Object.values(data)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null &&
      ('url' in value[0] || 'href' in value[0])
    ) {
      return value as Array<{ url?: string; href?: string; title?: string; name?: string }>;
    }
  }
  return null;
}

export function buildDataComponentBlocks(component: {
  id: string;
  data: Record<string, unknown>;
}): { blocks: any[]; overflowJson?: string; componentType?: string } {
  const { data } = component;
  const componentType = typeof data.type === 'string' ? data.type : undefined;
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 ${componentType || 'Data Component'}`, emoji: true },
    },
  ];

  const payload = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'type'));

  let overflowJson: string | undefined;
  if (Object.keys(payload).length > 0) {
    if (isFlatRecord(payload)) {
      const fields = Object.entries(payload)
        .slice(0, 10)
        .map(([k, v]) => {
          const val = String(v ?? '');
          const truncated = val.length > 80 ? `${val.slice(0, 80)}…` : val;
          return {
            type: 'mrkdwn',
            text: `*${escapeSlackMrkdwn(k)}*\n${escapeSlackMrkdwn(truncated)}`,
          };
        });
      blocks.push({ type: 'section', fields });
    } else {
      const jsonStr = JSON.stringify(payload, null, 2);
      if (jsonStr.length > 2900) {
        overflowJson = jsonStr;
      } else {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `\`\`\`json\n${jsonStr}\n\`\`\`` },
        });
      }
    }
  }

  if (componentType) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `data component · type: ${escapeSlackMrkdwn(componentType)}` },
      ],
    });
  }

  return { blocks, overflowJson, componentType };
}

export function buildDataArtifactBlocks(artifact: { data: Record<string, unknown> }): {
  blocks: any[];
  overflowContent?: string;
  artifactName?: string;
} {
  const { data } = artifact;

  const sourcesArray = findSourcesArray(data);
  if (sourcesArray && sourcesArray.length > 0) {
    const MAX_SOURCES = 10;
    const shown = sourcesArray.slice(0, MAX_SOURCES);
    const lines = shown
      .map((s) => {
        const url = s.url || s.href;
        const rawTitle = s.title || s.name || url;
        const title = rawTitle ? escapeSlackLinkText(rawTitle) : rawTitle;
        return url ? `• <${url}|${title}>` : null;
      })
      .filter((l): l is string => l !== null);

    if (lines.length > 0) {
      const suffix =
        sourcesArray.length > MAX_SOURCES
          ? `\n_and ${sourcesArray.length - MAX_SOURCES} more_`
          : '';
      return {
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `📚 *Sources*\n${lines.join('\n')}${suffix}` },
          },
        ],
      };
    }
  }

  const artifactType = typeof data.type === 'string' ? data.type : undefined;
  const name = typeof data.name === 'string' && data.name ? data.name : artifactType || 'Artifact';

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `📄 ${name}`, emoji: true } },
  ];

  if (artifactType) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `type: ${escapeSlackMrkdwn(artifactType)}` }],
    });
  }

  let overflowContent: string | undefined;
  if (typeof data.description === 'string' && data.description) {
    if (data.description.length > 2900) {
      overflowContent = data.description;
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: data.description } });
    }
  }

  return { blocks, overflowContent, artifactName: name };
}

export function buildCitationsBlock(citations: Array<{ title?: string; url?: string }>): any[] {
  const MAX_CITATIONS = 10;
  const shown = citations.slice(0, MAX_CITATIONS);
  const lines = shown
    .map((c) => {
      const url = c.url;
      const rawTitle = c.title || url;
      const title = rawTitle ? escapeSlackLinkText(rawTitle) : rawTitle;
      return url ? `• <${url}|${title}>` : null;
    })
    .filter((l): l is string => l !== null);

  if (lines.length === 0) return [];

  const suffix =
    citations.length > MAX_CITATIONS ? `\n_and ${citations.length - MAX_CITATIONS} more_` : '';
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `📚 *Sources*\n${lines.join('\n')}${suffix}` },
    },
  ];
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

export function createCreateInkeepAccountMessage(acceptUrl: string, expiresInMinutes: number) {
  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('Create your Inkeep account')}\n\n` +
          "You've been invited to join Inkeep. Create an account to start using Inkeep agents in Slack."
      ),
      Blocks.Actions().elements(
        Elements.Button().text('Create Account').url(acceptUrl).actionId('create_account').primary()
      ),
      Blocks.Context().elements(`This link expires in ${expiresInMinutes} minutes.`)
    )
    .buildToObject();
}
