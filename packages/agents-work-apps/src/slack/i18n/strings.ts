/**
 * Slack UI/UX Internationalization Strings
 *
 * Centralized strings for all Slack-facing UI text.
 * Update this file to change text across the entire Slack integration.
 */

export const SlackStrings = {
  // Button labels
  buttons: {
    triggerAgent: 'Trigger Agent',
    send: 'Send',
    followUp: 'Follow Up',
    cancel: 'Cancel',
    openDashboard: '⚙️ Open Dashboard',
  },

  // Modal titles
  modals: {
    triggerAgent: 'Trigger Agent',
    triggerAgentThread: 'Trigger Agent (Thread)',
    askAboutMessage: 'Ask About Message',
    followUp: 'Follow Up',
  },

  // Modal labels
  labels: {
    project: 'Project',
    agent: 'Agent',
    prompt: 'Prompt',
    additionalInstructions: 'Additional Instructions',
    context: 'Context',
  },

  // Modal placeholders
  placeholders: {
    selectProject: 'Select a project...',
    selectAgent: 'Select an agent...',
    enterPrompt: 'Enter your prompt or question...',
    additionalInstructionsOptional: 'Additional instructions (optional)...',
    additionalInstructionsMessage: 'Additional instructions or question about this message...',
  },

  // Visibility options
  visibility: {
    includeThreadContext: 'Include thread context',
  },

  // Context block text
  context: {
    poweredBy: (agentName: string) => `Powered by *${agentName}* via Inkeep`,
    privateResponse: '_Private response_',
  },

  // Usage hints
  usage: {
    mentionEmpty:
      '*To use your Inkeep agent, include a message:*\n\n' +
      '• `@Inkeep <message>` — Send a message to the default agent for the channel (reply appears in a thread)\n' +
      '• `@Inkeep <message>` in a thread — Includes the thread as context for your agent\n' +
      '• `@Inkeep` in a thread — Triggers your agent using the full thread as context\n\n' +
      '💡 Use `/inkeep help` for all available commands.',
  },

  // Status messages
  status: {
    thinking: (agentName: string) => `_${agentName} is thinking..._`,
    noAgentsAvailable: 'No agents available',
    noProjectsConfigured: '⚙️ No projects configured. Please set up projects in the dashboard.',
  },

  // Error messages
  errors: {
    generic: 'Sorry, something went wrong. Please try again.',
    failedToOpenSelector: '❌ Failed to open agent selector. Please try again.',
  },

  // Help message
  help: {
    title: 'Inkeep — How to Use',
    publicSection:
      '🔊 *Public* — everyone in the channel can see the response\n\n' +
      '• `@Inkeep <message>` — Send a message to the default agent for this channel\n' +
      '• `@Inkeep <message>` in a thread — Includes thread as context\n' +
      '• `@Inkeep` in a thread — Uses the full thread as context',
    privateSection:
      '🔒 *Private* — only you can see the response\n\n' +
      '• `/inkeep <message>` — Send a message to the default agent in this channel\n' +
      '• `/inkeep` — Open the agent picker to choose an agent and write a prompt',
    otherCommands:
      '⚙️ *Other Commands*\n\n' +
      '• `/inkeep status` — Check your connection and agent config\n' +
      '• `/inkeep link` / `/inkeep unlink` — Manage account connection\n' +
      '• `/inkeep help` — Show this message',
    docsLink: '📖 <https://docs.inkeep.com/talk-to-your-agents/slack/overview|Learn more>',
  },

  // Message context (for message shortcut modal)
  messageContext: {
    label: 'Message:',
  },
} as const;

export type SlackStringsType = typeof SlackStrings;
