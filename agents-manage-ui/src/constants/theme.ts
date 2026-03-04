export const MONACO_THEME_NAME = Object.freeze({
  light: 'inkeep-light',
  dark: 'inkeep-dark',
});
export const INKEEP_BRAND_COLOR = '#3784ff';
export const SLACK_BRAND_COLOR = '#4A154B';
export const DOCS_BASE_URL = 'https://docs.inkeep.com';
export const TEMPLATE_LANGUAGE = 'template';
export const VARIABLE_TOKEN = 'variable';

export const TEMPLATE_VARIABLE_REGEX = /\{\{(?!\{)(?<variableName>[^{}]+)}}/g;

/**
 * Used in `/[tenantId]/@breadcrumbs/[...slug]/page.tsx` parallel route and sidebar-nav/app-sidebar
 * In the future can be used for i18n.
 */
export const STATIC_LABELS = Object.freeze({
  projects: 'Projects',
  stats: 'Statistics',
  agents: 'Agents',
  'api-keys': 'API Keys',
  artifacts: 'Artifacts',
  settings: 'Settings',
  traces: 'Traces',
  credentials: 'Credentials',
  components: 'Components',
  'external-agents': 'External Agents',
  'mcp-servers': 'MCP Servers',
  bearer: 'Bearer',
  edit: 'Edit',
  providers: 'Providers',
  'tool-calls': 'Tool Calls',
  'ai-calls': 'AI Calls',
  conversations: 'Conversations',
  members: 'Members',
  evaluations: 'Evaluations',
  jobs: 'Batch Evaluations',
  'run-configs': 'Continuous Tests',
  datasets: 'Test Suites',
  runs: 'Runs',
  triggers: 'Triggers',
  webhooks: 'Webhooks',
  scheduled: 'Scheduled',
  'scheduled-triggers': 'Scheduled Triggers',
  invocations: 'Invocations',
  'work-apps': 'Work Apps',
  slack: 'Slack',
  github: 'GitHub',
  'no-organization-found': 'No organization found',
  skills: 'Skills',
});
