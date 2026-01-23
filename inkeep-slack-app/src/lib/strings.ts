// ============================================================
// src/lib/strings.ts
// All user-facing text strings
// ============================================================

export const strings = {
  auth: {
    loginHeader: '🔐 Connect to Inkeep',
    loginDescription: 'Connect your Inkeep account to start chatting with AI agents.',
    loginButton: 'Connect Inkeep Account',
    loginFooter: 'This will connect to your Inkeep organization',
    alreadyConnected: "✅ You're already connected to Inkeep!",
    notConnected: '❌ Not connected. Run `/inkeep login` to connect.',
    logoutSuccess: '✅ Disconnected from Inkeep.',
    loginSuccess: '✅ Connected to Inkeep!',
  },

  status: {
    connectedHeader: '✅ Connected to Inkeep',
    channelHeader: (name: string) => `⚙️ #${name} Configuration`,
    noConfig: (name: string) => `*#${name}* has no default agent configured.`,
    noConfigPrompt: 'Set one up so anyone can use `@Inkeep <question>` in this channel.',
    configuredBy: (userId: string, date: string) => `Configured by <@${userId}> on ${date}`,
  },

  help: {
    header: '🤖 Inkeep Commands',
    commands: `*Getting Started*
\`/inkeep login\` — Connect your Inkeep account
\`/inkeep logout\` — Disconnect account
\`/inkeep status\` — View configuration
\`/inkeep help\` — Show this help

*Ask Questions*
\`/inkeep\` — Open ask modal (private → DM)
\`/inkeep <question>\` — Ask with pre-filled question
\`@Inkeep <question>\` — Ask publicly in channel

*Configuration*
\`/inkeep default\` — Set channel default agent`,
    footer: '💡 `/inkeep` = private (DM) • `@Inkeep` = public (channel)',
  },

  selectors: {
    projectHeader: '📁 Select a Project',
    projectPlaceholder: 'Choose a project...',
    agentHeader: '🤖 Select an Agent',
    agentPlaceholder: 'Choose an agent...',
    noAgents: '⚠️ No agents found in this project.',
    backToProjects: '← Back to Projects',
  },

  ask: {
    modalTitle: 'Ask Inkeep',
    projectLabel: 'Project',
    agentLabel: 'Agent',
    questionLabel: 'Your Question',
    questionPlaceholder: 'What would you like to know?',
    checkDms: '✨ Check your DMs for the response!',
    thinking: '🤔 Thinking...',
    errorGeneric: '❌ Sorry, something went wrong. Please try again.',
  },

  mention: {
    noChannelConfig: 'No default agent configured for this channel.',
    noChannelConfigAdmin: 'Run `/inkeep default` to set one up.',
    noChannelConfigUser: 'Ask an admin to configure a default agent.',
    greeting: (agentName: string) => `👋 *${agentName}* here! How can I help?`,
  },

  config: {
    header: (channelName: string) => `⚙️ Configure #${channelName}`,
    selectProject: 'Select a project for this channel:',
    selectAgent: 'Select the default agent:',
    success: (channelName: string, agentName: string) =>
      `✅ *#${channelName}* now defaults to *${agentName}*`,
    removeSuccess: '✅ Default removed.',
    adminOnly: '❌ Only workspace admins can configure channel defaults.',
  },

  shortcut: {
    contextLabel: 'Message Context',
    questionLabel: 'Your Question (optional)',
    questionPlaceholder: 'What would you like to know about this?',
  },

  labels: {
    project: 'Project',
    agent: 'Agent',
    defaultAgent: 'Default Agent',
  },

  buttons: {
    ask: 'Ask',
    cancel: 'Cancel',
    save: 'Save',
    change: 'Change',
    remove: 'Remove',
    configure: 'Configure',
    refresh: '🔄 Refresh',
  },
} as const;

export type Strings = typeof strings;
