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
    shareToChannel: 'Share to Channel',
    shareToThread: 'Share to Thread',
    askAgain: 'Ask Again',
    cancel: 'Cancel',
    viewAllInDashboard: '📊 View All in Dashboard',
    openDashboard: '📊 Open Dashboard',
  },

  // Modal titles
  modals: {
    triggerAgent: 'Trigger Agent',
    triggerAgentThread: 'Trigger Agent (Thread)',
    askAboutMessage: 'Ask About Message',
  },

  // Modal labels
  labels: {
    project: 'Project',
    agent: 'Agent',
    prompt: 'Prompt',
    additionalInstructions: 'Additional Instructions',
    context: 'Context',
    visibility: 'Visibility',
    response: 'Response',
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
    private: 'Private (only visible to you)',
    privateResponse: 'Private response (only visible to you)',
    replyInThread: 'Reply in thread',
    postToChannel: 'Post to channel',
    includeThreadContext: 'Include thread context',
  },

  // Context block text
  context: {
    poweredBy: (agentName: string) => `Powered by *${agentName}* via Inkeep`,
    privateResponse: '_Private response_',
    sharedBy: (userId: string) => `Shared by <@${userId}>`,
  },

  // Status messages
  status: {
    thinking: (agentName: string) => `_${agentName} is thinking..._`,
    sharedToChannel: '✅ Response shared to channel!',
    sharedToThread: '✅ Response shared to thread!',
    noAgentsAvailable: 'No agents available',
    noAgentsFound: 'No agents found. Create an agent in the Inkeep dashboard first.',
    noProjectsConfigured: '⚙️ No projects configured. Please set up projects in the dashboard.',
    linkAccountFirst: '🔗 You need to link your account first. Use `/inkeep link` to get started.',
  },

  // Error messages
  errors: {
    generic: 'Sorry, something went wrong. Please try again.',
    couldNotShareToChannel: '❌ Failed to share to channel. Please try again.',
    couldNotShareToThread: '❌ Failed to share to thread. Please try again.',
    couldNotFindContent: '❌ Could not find content to share.',
    couldNotFindThread: '❌ Could not find thread to share to.',
    failedToOpenSelector: '❌ Failed to open agent selector. Please try again.',
    unableToOpenSelector:
      'Unable to open agent selector. Please try using @Inkeep <your question> instead.',
  },

  // Help message
  help: {
    title: 'Inkeep Slack Commands',
    mentionUsage: '@Inkeep Usage:',
    mentionWithQuestion: '@Inkeep [question]',
    mentionWithQuestionDesc: 'Ask a question',
    mentionWithQuestionDetail: 'Response visible to everyone in a thread',
    mentionNoQuestion: '@Inkeep',
    mentionNoQuestionDesc: 'Agent picker',
    mentionNoQuestionChannelDetail: 'In channels: Opens modal to select agent and prompt',
    mentionNoQuestionThreadDetail: 'In threads: Analyzes full thread context automatically',
    slashUsage: '/inkeep Usage:',
    slashNoArgs: '/inkeep',
    slashNoArgsDesc: 'Agent picker',
    slashNoArgsDetail: 'Opens modal to select agent and prompt (private)',
    slashWithQuestion: '/inkeep [question]',
    slashWithQuestionDesc: 'Private response',
    slashWithQuestionDetail: 'Only you see the response',
    otherCommands: 'Other Commands:',
    commandRun: '`/inkeep run "agent name" [question]` - Ask a specific agent',
    commandList: '`/inkeep list` - List available agents',
    commandStatus: '`/inkeep status` - Check connection and agent config',
    commandLink: '`/inkeep link` / `/inkeep unlink` - Manage account connection',
    commandHelp: '`/inkeep help` - Show this help message',
  },

  // Agent list
  agentList: {
    title: '🤖 Available Agents',
    usage: 'Usage:',
    runUsage: '`/inkeep run "agent name" question` - Run a specific agent',
    andMore: (count: number) => `...and ${count} more`,
  },

  // Message context (for message shortcut modal)
  messageContext: {
    label: 'Message:',
  },
} as const;

export type SlackStringsType = typeof SlackStrings;
