import { Blocks, Elements, Md, Message } from 'slack-block-builder';

export function createLinkMessage(dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('Connect your Inkeep account') +
          '\n\nTo link your Slack account to Inkeep:\n' +
          '1. Click the button below to open the dashboard\n' +
          '2. Sign in to your Inkeep account\n' +
          '3. Click "Connect Slack Account"\n' +
          '4. Authorize the connection'
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text('🔗 Go to Inkeep Dashboard')
          .url(dashboardUrl)
          .actionId('open_dashboard')
          .primary()
      )
    )
    .buildToObject();
}

export function createAlreadyConnectedMessage(
  email: string,
  linkedAt: string,
  dashboardUrl: string
) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Already Connected!') +
          '\n\nYour Slack account is linked to Inkeep.\n\n' +
          Md.bold('Inkeep Account:') +
          ` ${email}\n` +
          Md.bold('Linked:') +
          ` ${new Date(linkedAt).toLocaleDateString()}`
      ),
      Blocks.Actions().elements(
        Elements.Button().text('📊 View Dashboard').url(dashboardUrl).actionId('view_dashboard')
      )
    )
    .buildToObject();
}

export function createStatusConnectedMessage(
  userName: string,
  email: string,
  linkedAt: string,
  dashboardUrl: string
) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Connected to Inkeep') +
          `\n\n${Md.bold('Slack User:')} @${userName}\n` +
          `${Md.bold('Inkeep Account:')} ${email}\n` +
          `${Md.bold('Linked:')} ${new Date(linkedAt).toLocaleDateString()}\n\n` +
          'You can now use Inkeep from Slack!'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('📊 View Dashboard').url(dashboardUrl).actionId('view_dashboard')
      )
    )
    .buildToObject();
}

export function createStatusNotConnectedMessage(
  userName: string,
  teamDomain: string,
  _dashboardUrl: string
) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('❌ Not Linked') +
          `\n\n${Md.bold('Slack User:')} @${userName}\n` +
          `${Md.bold('Team:')} ${teamDomain}\n\n` +
          'Run `/inkeep link` to connect your Inkeep account.'
      )
    )
    .buildToObject();
}

export function createLogoutSuccessMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Logged out successfully') +
          '\n\nYour Slack account has been unlinked from Inkeep.\n\n' +
          'Use `/inkeep link` to reconnect anytime.'
      )
    )
    .buildToObject();
}

export function createProjectListMessage(
  email: string,
  projects: Array<{ id: string; name: string | null; description: string | null }>,
  dashboardUrl: string,
  totalCount: number
) {
  const projectList = projects
    .slice(0, 10)
    .map(
      (p) =>
        `• ${Md.bold(p.name || p.id)} (\`${p.id}\`)${p.description ? `\n  ${Md.italic(p.description)}` : ''}`
    )
    .join('\n');

  const moreText = totalCount > 10 ? `\n\n...and ${totalCount - 10} more` : '';

  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('📋 Your Inkeep Projects') +
          `\n\n${Md.bold('Account:')} ${email}\n\n` +
          projectList +
          moreText
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text('📊 View All in Dashboard')
          .url(`${dashboardUrl}/projects`)
          .actionId('view_projects')
      )
    )
    .buildToObject();
}

export function createNoProjectsMessage(email: string, dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('📋 Your Inkeep Projects') +
          `\n\n${Md.bold('Account:')} ${email}\n\n` +
          Md.italic('No projects found. Create one in the dashboard!')
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text('➕ Create Project')
          .url(`${dashboardUrl}/projects`)
          .actionId('create_project')
          .primary()
      )
    )
    .buildToObject();
}

export function createHelpMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(`${Md.bold('Inkeep Slack Commands')}\n\nAvailable commands:`),
      Blocks.Section().text(
        '• `/inkeep link` - Connect your Slack account to Inkeep\n' +
          '• `/inkeep status` - Check your connection status\n' +
          '• `/inkeep list` - List your Inkeep projects\n' +
          '• `/inkeep logout` - Unlink your account\n' +
          '• `/inkeep help` - Show this help message'
      )
    )
    .buildToObject();
}

export function createErrorMessage(message: string) {
  return Message()
    .blocks(Blocks.Section().text(`❌ ${message}`))
    .buildToObject();
}

export function createAgentResponseMessage(
  agentName: string,
  response: string,
  channelId?: string
) {
  if (channelId) {
    const truncatedResponse = response.length > 1800 ? `${response.slice(0, 1800)}...` : response;

    return Message()
      .blocks(
        Blocks.Section().text(response),
        Blocks.Context().elements(`Powered by ${Md.bold(agentName)} via Inkeep`),
        Blocks.Actions().elements(
          Elements.Button()
            .text('📢 Share to Channel')
            .actionId('share_to_channel')
            .value(JSON.stringify({ channelId, text: truncatedResponse, agentName }))
        )
      )
      .buildToObject();
  }

  return Message()
    .blocks(
      Blocks.Section().text(response),
      Blocks.Context().elements(`Powered by ${Md.bold(agentName)} via Inkeep`)
    )
    .buildToObject();
}

export function createSettingsMessage(
  email: string,
  defaultAgentName: string | undefined,
  dashboardUrl: string
) {
  const agentStatus = defaultAgentName
    ? `✅ ${Md.bold(defaultAgentName)}`
    : `❌ ${Md.italic('Not configured')}`;

  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('⚙️ Your Slack Settings')}\n\n` +
          `${Md.bold('Inkeep Account:')} ${email}\n` +
          `${Md.bold('Default Agent:')} ${agentStatus}\n\n` +
          'Use `/inkeep settings set [agent-name]` to change your default agent.'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('📊 Manage in Dashboard').url(dashboardUrl).actionId('open_settings')
      )
    )
    .buildToObject();
}

export function createSettingsUpdatedMessage(agentName: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('✅ Default Agent Updated')}\n\n` +
          `Your default agent is now: ${Md.bold(agentName)}\n\n` +
          'You can now use `/inkeep [question]` to ask questions.'
      )
    )
    .buildToObject();
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

  const moreText = agents.length > 15 ? `\n\n...and ${agents.length - 15} more` : '';

  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('🤖 Available Agents')}\n\n` +
          agentList +
          moreText +
          '\n\n' +
          'Use `/inkeep run [agent-name] [question]` to run a specific agent.\n' +
          'Use `/inkeep settings set [agent-name]` to set your default.'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('📊 View All in Dashboard').url(dashboardUrl).actionId('view_agents')
      )
    )
    .buildToObject();
}

export function createNoDefaultAgentMessage(dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        `${Md.bold('⚠️ No Default Agent Configured')}\n\n` +
          'To use `/inkeep [question]`, you need to set a default agent first.\n\n' +
          '1. Use `/inkeep list` to see available agents\n' +
          '2. Use `/inkeep settings set [agent-name]` to set your default'
      ),
      Blocks.Actions().elements(
        Elements.Button()
          .text('🔗 Configure in Dashboard')
          .url(dashboardUrl)
          .actionId('configure_default')
          .primary()
      )
    )
    .buildToObject();
}

export function createThinkingMessage(agentName: string) {
  return Message()
    .blocks(Blocks.Section().text(`🤔 ${Md.italic(`${agentName} is thinking...`)}`))
    .buildToObject();
}

export function createUpdatedHelpMessage() {
  return Message()
    .blocks(
      Blocks.Section().text(`${Md.bold('Inkeep Slack Commands')}\n\nAvailable commands:`),
      Blocks.Section().text(
        `${Md.bold('Ask Questions:')}\n` +
          '• `@inkeep [question]` - Ask in channel (public, creates thread)\n' +
          '• `/inkeep [question]` - Ask channel/global default (ephemeral)\n' +
          '• `/inkeep trigger [question]` - Ask your personal default\n' +
          '• `/inkeep run [agent] [question]` - Ask a specific agent\n\n' +
          `${Md.bold('Configuration:')}\n` +
          '• `/inkeep settings` - View your settings\n' +
          '• `/inkeep settings set [agent]` - Set your personal default agent\n' +
          '• `/inkeep list` - List available agents\n\n' +
          `${Md.bold('Account:')}\n` +
          '• `/inkeep link` - Link your Inkeep account\n' +
          '• `/inkeep status` - Check connection status\n' +
          '• `/inkeep unlink` - Disconnect your account\n' +
          '• `/inkeep help` - Show this help message'
      )
    )
    .buildToObject();
}

export function createDeviceCodeMessage(code: string, linkUrl: string, expiresInMinutes: number) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('🔗 Link your Inkeep account') + '\n\nTo connect your Slack and Inkeep accounts:'
      ),
      Blocks.Section().text(
        `${Md.bold('Your code:')} \`${code}\`\n\n` +
          '1. Click the button below (or copy the code)\n' +
          '2. Sign in to Inkeep (or create an account)\n' +
          '3. The link will complete automatically!'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('🔗 Link Account').url(linkUrl).actionId('link_account').primary()
      ),
      Blocks.Context().elements(
        `${Md.emoji('clock')} This code expires in ${expiresInMinutes} minutes`
      )
    )
    .buildToObject();
}

export function createLinkSuccessMessage(email: string, dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('✅ Account Linked!') +
          '\n\nYour Slack account is now connected to Inkeep.\n\n' +
          Md.bold('Inkeep Account:') +
          ` ${email}\n\n` +
          'You can now:\n' +
          '• Ask questions with `@Inkeep [question]`\n' +
          '• Run commands with `/inkeep [command]`\n' +
          '• Trigger your agents directly from Slack'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('📊 Open Dashboard').url(dashboardUrl).actionId('open_dashboard')
      )
    )
    .buildToObject();
}

export function createLinkExpiredMessage(_dashboardUrl: string) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('⏰ Code Expired') +
          '\n\nYour link code has expired. Please run `/inkeep link` again to get a new code.'
      ),
      Blocks.Actions().elements(Elements.Button().text('🔗 Get New Code').actionId('get_new_code'))
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
        Elements.Button().text('📊 Open Dashboard').url(dashboardUrl).actionId('open_dashboard')
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
