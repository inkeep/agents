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
  dashboardUrl: string
) {
  return Message()
    .blocks(
      Blocks.Section().text(
        Md.bold('❌ Not Connected') +
          `\n\n${Md.bold('Slack User:')} @${userName}\n` +
          `${Md.bold('Team:')} ${teamDomain}\n\n` +
          'Use `/inkeep link` to connect your Inkeep account.'
      ),
      Blocks.Actions().elements(
        Elements.Button().text('🔗 Connect Now').url(dashboardUrl).actionId('connect_now').primary()
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
