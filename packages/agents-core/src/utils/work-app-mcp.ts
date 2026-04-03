export const TRUSTED_WORK_APP_MCP_PATHS = {
  slack: '/work-apps/slack/mcp',
  github: '/work-apps/github/mcp',
  feedback: '/work-apps/feedback/mcp',
};

export const PLATFORM_MCP_PATHS = [TRUSTED_WORK_APP_MCP_PATHS.feedback];

export const isTrustedWorkAppMcpUrl = (
  url: string | URL,
  path: string,
  baseUrl: string | undefined
): boolean => {
  if (!baseUrl) return false;
  try {
    const toolUrl = new URL(String(url));
    const base = new URL(baseUrl);
    const baseDomain = base.hostname.split('.').slice(-2).join('.');
    const isTrustedDomain =
      toolUrl.hostname === base.hostname || toolUrl.hostname.endsWith(`.${baseDomain}`);
    return isTrustedDomain && toolUrl.pathname === path;
  } catch {
    return false;
  }
};

export const isPlatformMcpUrl = (
  url: string | URL,
  baseUrl: string | undefined
): boolean => {
  return PLATFORM_MCP_PATHS.some((path) => isTrustedWorkAppMcpUrl(url, path, baseUrl));
};
