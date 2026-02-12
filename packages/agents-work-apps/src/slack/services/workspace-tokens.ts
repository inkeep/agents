/**
 * Workspace Token Service
 *
 * In-memory cache for Slack bot tokens during OAuth installation flow.
 * Primary token storage is in Nango; this is a temporary fallback.
 *
 * Note: Tokens stored here do not persist across server restarts.
 * Always prefer fetching tokens from Nango for production use.
 */

const workspaceBotTokens = new Map<
  string,
  { botToken: string; teamName: string; installedAt: string }
>();

/**
 * Get the cached bot token for a Slack team.
 * Falls back to null if not cached (caller should fetch from Nango).
 */
export function getBotTokenForTeam(teamId: string): string | null {
  const workspace = workspaceBotTokens.get(teamId);
  return workspace?.botToken || null;
}

/**
 * Cache a bot token for a Slack team (used during OAuth installation).
 */
export function setBotTokenForTeam(
  teamId: string,
  data: { botToken: string; teamName: string; installedAt: string }
): void {
  workspaceBotTokens.set(teamId, data);
}
