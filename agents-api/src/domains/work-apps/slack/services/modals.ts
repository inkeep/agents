import type { ModalView } from '@slack/web-api';

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
}

export function buildAgentSelectorModal(agents: AgentOption[], metadata: ModalMetadata): ModalView {
  const isInThread = metadata.isInThread;

  const agentOptions = agents.map((agent) => ({
    text: {
      type: 'plain_text' as const,
      text: `${agent.name || agent.id} (${agent.projectName || agent.projectId})`,
      emoji: true,
    },
    value: JSON.stringify({ agentId: agent.id, projectId: agent.projectId }),
  }));

  const blocks: ModalView['blocks'] = [
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
      },
      label: {
        type: 'plain_text',
        text: 'Agent',
        emoji: true,
      },
    },
  ];

  if (isInThread && metadata.threadMessageCount) {
    blocks.push({
      type: 'section',
      block_id: 'thread_context_info',
      text: {
        type: 'mrkdwn',
        text: `📝 *Thread context:* ${metadata.threadMessageCount} messages will be included as context`,
      },
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
