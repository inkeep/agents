export interface RuntimeConfig {
  INKEEP_AGENTS_MANAGE_API_URL: string;
  INKEEP_AGENTS_RUN_API_URL: string;
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET?: string;
  SIGNOZ_URL: string;
  NANGO_SERVER_URL?: string;
  NANGO_CONNECT_BASE_URL?: string;
}
