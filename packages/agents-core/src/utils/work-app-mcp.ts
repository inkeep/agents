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
    const toolUrl = new URL(String(url));
    const base = new URL(baseUrl);
    return toolUrl.origin === base.origin && toolUrl.pathname === path;
  } catch {
    return false;
  }
};
