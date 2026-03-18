export const TRUSTED_WORK_APP_MCP_PATHS = {
  slack: '/work-apps/slack/mcp',
  github: '/work-apps/github/mcp',
};

export const isTrustedWorkAppMcpUrl = (
  url: string | URL,
  path: string,
  baseUrl: string | undefined
): boolean => {
  if (!baseUrl) return false;
  try {
    const trusted = new URL(path, baseUrl);
    const toolUrl = new URL(String(url), baseUrl);
    return toolUrl.origin === trusted.origin && toolUrl.pathname === trusted.pathname;
  } catch {
    return false;
  }
};
