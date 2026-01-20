export const MONACO_THEME_NAME = Object.freeze({
  light: 'inkeep-light',
  dark: 'inkeep-dark',
});

export const TEMPLATE_LANGUAGE = 'template';
export const VARIABLE_TOKEN = 'variable';

/**
 * Used in `/[tenantId]/@breadcrumbs/[...slug]/page.tsx` parallel route and sidebar-nav/app-sidebar
 * In the future can be used for i18n.
 */
export const STATIC_LABELS = Object.freeze({
  projects: 'Projects',
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
});
