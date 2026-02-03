/**
 * Slack Modal Builders
 *
 * Functions for building Slack modal views for agent selection and configuration.
 * Uses Slack Block Kit format for modal construction.
 */

import type { ModalView } from '@slack/web-api';

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
}

export interface BuildAgentSelectorModalParams {
  projects: Array<{ id: string; name: string }>;
  agents: AgentOption[];
  metadata: ModalMetadata;
  selectedProjectId?: string;
}

/**
 * Build the agent selector modal for thread context.
 *
 * Shows:
 * - Project dropdown
 * - Agent dropdown (updates based on project selection)
 * - Include thread context checkbox (if in thread)
 * - Question/instructions input
 * - Private response checkbox
 *
 * @param params - Modal configuration parameters
 * @returns Slack ModalView object ready for views.open()
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
            text: { type: 'plain_text' as const, text: 'No agents available', emoji: true },
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
      element: {
        type: 'static_select',
        action_id: 'modal_project_select',
        placeholder: {
          type: 'plain_text',
          text: 'Select a project...',
        },
        options: projectOptions,
        ...(selectedProjectOption ? { initial_option: selectedProjectOption } : {}),
      },
      label: {
        type: 'plain_text',
        text: 'Project',
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
          text: 'Select an agent...',
        },
        options: agentOptions,
        ...(agents.length > 0 ? { initial_option: agentOptions[0] } : {}),
      },
      label: {
        type: 'plain_text',
        text: 'Agent',
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
              text: 'Include thread context',
              emoji: true,
            },
            value: 'include_context',
          },
        ],
        initial_options: [
          {
            text: {
              type: 'plain_text',
              text: 'Include thread context',
              emoji: true,
            },
            value: 'include_context',
          },
        ],
      },
      label: {
        type: 'plain_text',
        text: 'Context',
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
        text: isInThread ? 'Additional instructions (optional)...' : 'What would you like to ask?',
      },
    },
    label: {
      type: 'plain_text',
      text: isInThread ? 'Additional Instructions' : 'Your Question',
      emoji: true,
    },
    optional: isInThread,
  });

  blocks.push({
    type: 'input',
    block_id: 'visibility_block',
    element: {
      type: 'checkboxes',
      action_id: 'visibility_checkbox',
      options: [
        {
          text: {
            type: 'plain_text',
            text: 'Private response (only visible to you)',
            emoji: true,
          },
          value: 'ephemeral',
        },
      ],
    },
    label: {
      type: 'plain_text',
      text: 'Visibility',
      emoji: true,
    },
    optional: true,
  });

  return {
    type: 'modal',
    callback_id: 'agent_selector_modal',
    private_metadata: JSON.stringify(metadata),
    title: {
      type: 'plain_text',
      text: isInThread ? 'Ask About Thread' : 'Ask an Agent',
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: 'Ask Agent',
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true,
    },
    blocks,
  };
}

export interface ModalSubmissionData {
  agentId: string;
  projectId: string;
  question: string;
  isEphemeral: boolean;
  metadata: ModalMetadata;
}

/**
 * Parse the modal submission payload from Slack.
 * Extracts agent selection, question, and visibility settings.
 *
 * @param view - The view object from view_submission event
 * @returns Parsed submission data, or null if parsing fails
 */
export function parseModalSubmission(view: {
  private_metadata?: string;
  state?: {
    values?: Record<string, Record<string, unknown>>;
  };
}): ModalSubmissionData | null {
  try {
    const metadata = JSON.parse(view.private_metadata || '{}') as ModalMetadata;

    const values = view.state?.values || {};

    const agentSelectValue = values.agent_select_block?.agent_select as {
      selected_option?: { value?: string };
    };
    const questionValue = values.question_block?.question_input as { value?: string };
    const visibilityValue = values.visibility_block?.visibility_checkbox as {
      selected_options?: Array<{ value?: string }>;
    };

    const agentData = JSON.parse(agentSelectValue?.selected_option?.value || '{}');

    return {
      agentId: agentData.agentId || '',
      projectId: agentData.projectId || '',
      question: questionValue?.value || '',
      isEphemeral: visibilityValue?.selected_options?.some((o) => o.value === 'ephemeral') || false,
      metadata,
    };
  } catch {
    return null;
  }
}
