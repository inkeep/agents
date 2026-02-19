/**
 * Slack Modal Builders
 *
 * Functions for building Slack modal views for agent selection and configuration.
 * Uses Slack Block Kit format for modal construction.
 */

import type { ModalView } from '@slack/web-api';
import { env } from '../../env';
import { SlackStrings } from '../i18n';

const manageUiBaseUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

/** Agent option for dropdown selection */
export interface AgentOption {
  id: string;
  name: string | null;
  projectId: string;
  projectName: string | null;
}

export interface ModalMetadata {
  channel: string;
  threadTs?: string;
  messageTs: string;
  teamId: string;
  slackUserId: string;
  tenantId: string;
  isInThread: boolean;
  threadMessageCount?: number;
  buttonResponseUrl?: string;
  messageContext?: string;
}

export interface FollowUpModalMetadata {
  conversationId: string;
  agentId: string;
  projectId: string;
  tenantId: string;
  teamId: string;
  slackUserId: string;
  channel: string;
}

export interface BuildAgentSelectorModalParams {
  projects: Array<{ id: string; name: string }>;
  agents: AgentOption[];
  metadata: ModalMetadata;
  selectedProjectId?: string;
}

/**
 * Build the agent selector modal.
 *
 * Shows:
 * - Project dropdown
 * - Agent dropdown (updates based on project selection)
 * - Include thread context checkbox (if in thread)
 * - Question/instructions input
 * - Dashboard link
 *
 * All responses from this modal are private (ephemeral).
 */
export function buildAgentSelectorModal(params: BuildAgentSelectorModalParams): ModalView {
  const { projects, agents, metadata, selectedProjectId } = params;
  const isInThread = metadata.isInThread;

  const projectOptions = projects.map((project) => ({
    text: {
      type: 'plain_text' as const,
      text: project.name,
      emoji: true,
    },
    value: project.id,
  }));

  const agentOptions =
    agents.length > 0
      ? agents.map((agent) => ({
          text: {
            type: 'plain_text' as const,
            text: agent.name || agent.id,
            emoji: true,
          },
          value: JSON.stringify({ agentId: agent.id, projectId: agent.projectId }),
        }))
      : [
          {
            text: {
              type: 'plain_text' as const,
              text: SlackStrings.status.noAgentsAvailable,
              emoji: true,
            },
            value: 'none',
          },
        ];

  const selectedProjectOption = selectedProjectId
    ? projectOptions.find((p) => p.value === selectedProjectId)
    : projectOptions[0];

  const blocks: ModalView['blocks'] = [
    {
      type: 'input',
      block_id: 'project_select_block',
      dispatch_action: true,
      element: {
        type: 'static_select',
        action_id: 'modal_project_select',
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.selectProject,
        },
        options: projectOptions,
        ...(selectedProjectOption ? { initial_option: selectedProjectOption } : {}),
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.project,
        emoji: true,
      },
    },
    {
      type: 'input',
      block_id: 'agent_select_block',
      element: {
        type: 'static_select',
        action_id: 'agent_select',
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.selectAgent,
        },
        options: agentOptions,
        ...(agents.length > 0 ? { initial_option: agentOptions[0] } : {}),
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.agent,
        emoji: true,
      },
    },
  ];

  if (isInThread) {
    blocks.push({
      type: 'input',
      block_id: 'context_block',
      element: {
        type: 'checkboxes',
        action_id: 'include_context_checkbox',
        options: [
          {
            text: {
              type: 'plain_text',
              text: SlackStrings.visibility.includeThreadContext,
              emoji: true,
            },
            value: 'include_context',
          },
        ],
        initial_options: [
          {
            text: {
              type: 'plain_text',
              text: SlackStrings.visibility.includeThreadContext,
              emoji: true,
            },
            value: 'include_context',
          },
        ],
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.context,
        emoji: true,
      },
      optional: true,
    });
  }

  blocks.push({
    type: 'input',
    block_id: 'question_block',
    element: {
      type: 'plain_text_input',
      action_id: 'question_input',
      multiline: true,
      placeholder: {
        type: 'plain_text',
        text: isInThread
          ? SlackStrings.placeholders.additionalInstructionsOptional
          : SlackStrings.placeholders.enterPrompt,
      },
    },
    label: {
      type: 'plain_text',
      text: isInThread ? SlackStrings.labels.additionalInstructions : SlackStrings.labels.prompt,
      emoji: true,
    },
    optional: isInThread,
  });

  // Dashboard link at the bottom
  const dashboardUrl = `${metadata.tenantId ? `/${metadata.tenantId}` : ''}/work-apps/slack`;
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${manageUiBaseUrl}${dashboardUrl}|Open Dashboard>`,
      },
    ],
  } as unknown as (typeof blocks)[number]);

  return {
    type: 'modal',
    callback_id: 'agent_selector_modal',
    private_metadata: JSON.stringify(metadata),
    title: {
      type: 'plain_text',
      text: isInThread ? SlackStrings.modals.triggerAgentThread : SlackStrings.modals.triggerAgent,
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: SlackStrings.buttons.triggerAgent,
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: SlackStrings.buttons.cancel,
      emoji: true,
    },
    blocks,
  };
}

/**
 * Build a follow-up modal for continuing a conversation.
 *
 * Shows only a prompt input. Agent and project are carried from the previous turn
 * via metadata. The conversationId ensures the agent has full history.
 */
export function buildFollowUpModal(metadata: FollowUpModalMetadata): ModalView {
  const blocks: ModalView['blocks'] = [
    {
      type: 'input',
      block_id: 'question_block',
      element: {
        type: 'plain_text_input',
        action_id: 'question_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.enterPrompt,
        },
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.prompt,
        emoji: true,
      },
    },
  ];

  return {
    type: 'modal',
    callback_id: 'follow_up_modal',
    private_metadata: JSON.stringify(metadata),
    title: {
      type: 'plain_text',
      text: SlackStrings.modals.followUp,
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: SlackStrings.buttons.send,
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: SlackStrings.buttons.cancel,
      emoji: true,
    },
    blocks,
  };
}

export interface BuildMessageShortcutModalParams {
  projects: Array<{ id: string; name: string }>;
  agents: AgentOption[];
  metadata: ModalMetadata;
  selectedProjectId?: string;
  messageContext: string;
}

/**
 * Build the modal for message shortcut (context menu on a message).
 *
 * Shows:
 * - Message context (read-only display)
 * - Project dropdown
 * - Agent dropdown
 * - Additional instructions input
 * - Dashboard link
 *
 * All responses from this modal are private (ephemeral).
 */
export function buildMessageShortcutModal(params: BuildMessageShortcutModalParams): ModalView {
  const { projects, agents, metadata, selectedProjectId, messageContext } = params;

  const projectOptions = projects.map((project) => ({
    text: {
      type: 'plain_text' as const,
      text: project.name,
      emoji: true,
    },
    value: project.id,
  }));

  const agentOptions =
    agents.length > 0
      ? agents.map((agent) => ({
          text: {
            type: 'plain_text' as const,
            text: agent.name || agent.id,
            emoji: true,
          },
          value: JSON.stringify({ agentId: agent.id, projectId: agent.projectId }),
        }))
      : [
          {
            text: {
              type: 'plain_text' as const,
              text: SlackStrings.status.noAgentsAvailable,
              emoji: true,
            },
            value: 'none',
          },
        ];

  const selectedProjectOption = selectedProjectId
    ? projectOptions.find((p) => p.value === selectedProjectId)
    : projectOptions[0];

  const truncatedContext =
    messageContext.length > 500 ? `${messageContext.slice(0, 500)}...` : messageContext;

  const blocks: ModalView['blocks'] = [
    {
      type: 'section',
      block_id: 'message_context_display',
      text: {
        type: 'mrkdwn',
        text: `*${SlackStrings.messageContext.label}*\n>${truncatedContext.split('\n').join('\n>')}`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'input',
      block_id: 'project_select_block',
      dispatch_action: true,
      element: {
        type: 'static_select',
        action_id: 'modal_project_select',
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.selectProject,
        },
        options: projectOptions,
        ...(selectedProjectOption ? { initial_option: selectedProjectOption } : {}),
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.project,
        emoji: true,
      },
    },
    {
      type: 'input',
      block_id: 'agent_select_block',
      element: {
        type: 'static_select',
        action_id: 'agent_select',
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.selectAgent,
        },
        options: agentOptions,
        ...(agents.length > 0 ? { initial_option: agentOptions[0] } : {}),
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.agent,
        emoji: true,
      },
    },
    {
      type: 'input',
      block_id: 'question_block',
      element: {
        type: 'plain_text_input',
        action_id: 'question_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: SlackStrings.placeholders.additionalInstructionsMessage,
        },
      },
      label: {
        type: 'plain_text',
        text: SlackStrings.labels.additionalInstructions,
        emoji: true,
      },
      optional: true,
    },
  ];

  // Dashboard link at the bottom
  const dashboardUrl = `${metadata.tenantId ? `/${metadata.tenantId}` : ''}/work-apps/slack`;
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${manageUiBaseUrl}${dashboardUrl}|Open Dashboard>`,
      },
    ],
  } as unknown as (typeof blocks)[number]);

  return {
    type: 'modal',
    callback_id: 'agent_selector_modal',
    private_metadata: JSON.stringify(metadata),
    title: {
      type: 'plain_text',
      text: SlackStrings.modals.askAboutMessage,
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: SlackStrings.buttons.triggerAgent,
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: SlackStrings.buttons.cancel,
      emoji: true,
    },
    blocks,
  };
}
