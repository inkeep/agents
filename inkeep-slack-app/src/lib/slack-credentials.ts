// ============================================================
// src/lib/slack-credentials.ts
// Slack credential management with Nango integration
// ============================================================

/**
 * TODO: Replace with actual agents-core imports once monorepo is set up:
 * import { getSlackWorkspaceByTeamId } from '@inkeep/agents-core/data-access/manage/slack';
 */

import { getAgentsDb } from './db';
import { getEnv } from './env';
import { getSlackBotTokenByConnectionId } from './nango';

// ============================================================
// Types
// ============================================================

/**
 * Slack workspace type (matches agents-core schema)
 */
export interface SlackWorkspace {
  id: string;
  tenantId: string;
  projectId: string;
  teamId: string;
  teamName: string;
  teamDomain: string | null;
  installedBy: string;
  botUserId: string;
  scopes: string;
  nangoConnectionId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// In-Memory Cache
// ============================================================

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const workspaceCache = new Map<string, { workspace: SlackWorkspace; expiresAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedToken(teamId: string): string | null {
  const cached = tokenCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  tokenCache.delete(teamId);
  return null;
}

function setCachedToken(teamId: string, token: string): void {
  tokenCache.set(teamId, { token, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedWorkspace(teamId: string): SlackWorkspace | null {
  const cached = workspaceCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.workspace;
  }
  workspaceCache.delete(teamId);
  return null;
}

function setCachedWorkspace(teamId: string, workspace: SlackWorkspace): void {
  workspaceCache.set(teamId, { workspace, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// Public API
// ============================================================

/**
 * Get Slack workspace by team ID
 */
export async function getSlackWorkspaceByTeamId(teamId: string): Promise<SlackWorkspace | null> {
  // Check cache
  const cached = getCachedWorkspace(teamId);
  if (cached) {
    console.debug(`[SlackCredentials] Using cached workspace for team: ${teamId}`);
    return cached;
  }

  const db = getAgentsDb();

  try {
    // TODO: Once agents-core is integrated, this will use proper Drizzle queries
    const workspace = await db.query.slackWorkspaces.findFirst({ where: { teamId } });

    if (!workspace) {
      console.warn(`[SlackCredentials] Workspace not found for team: ${teamId}`);
      return null;
    }

    const mapped = workspace as SlackWorkspace;
    setCachedWorkspace(teamId, mapped);
    console.log(`[SlackCredentials] Found workspace for team: ${teamId}`);

    return mapped;
  } catch (error) {
    console.error('[SlackCredentials] Failed to get workspace by team ID:', error);
    return null;
  }
}

/**
 * Get Slack bot token for a team
 *
 * Strategy:
 * 1. Check cache for token
 * 2. Look up workspace in DB by teamId
 * 3. If found and has nangoConnectionId, fetch token from Nango
 * 4. Fall back to SLACK_BOT_TOKEN env var for single-workspace dev
 */
export async function getSlackBotToken(teamId: string): Promise<string | null> {
  const env = getEnv();

  // Check cache first
  const cached = getCachedToken(teamId);
  if (cached) {
    console.debug(`[SlackCredentials] Using cached token for team: ${teamId}`);
    return cached;
  }

  // Try to get from Nango via workspace lookup
  try {
    const workspace = await getSlackWorkspaceByTeamId(teamId);

    if (workspace?.nangoConnectionId) {
      const token = await getSlackBotTokenByConnectionId(workspace.nangoConnectionId);

      if (token) {
        setCachedToken(teamId, token);
        console.log(`[SlackCredentials] Retrieved token from Nango for team: ${teamId}`);
        return token;
      }
    }
  } catch (error) {
    console.error('[SlackCredentials] Error fetching token from Nango:', error);
  }

  // Fall back to env var for single-workspace dev
  if (env.SLACK_BOT_TOKEN) {
    console.debug('[SlackCredentials] Using fallback SLACK_BOT_TOKEN');
    return env.SLACK_BOT_TOKEN;
  }

  return null;
}

/**
 * Get bot user ID for a team
 */
export async function getSlackBotUserId(teamId: string): Promise<string | null> {
  try {
    const workspace = await getSlackWorkspaceByTeamId(teamId);
    return workspace?.botUserId || null;
  } catch (error) {
    console.error('[SlackCredentials] Error fetching bot user ID:', error);
    return null;
  }
}

// ============================================================
// Workspace CRUD Operations
// ============================================================

/**
 * Store a new Slack workspace after OAuth installation
 *
 * TODO: Replace with agents-core implementation once monorepo is set up
 */
export async function saveSlackWorkspace(data: {
  tenantId: string;
  projectId: string;
  teamId: string;
  teamName: string;
  teamDomain?: string;
  installedBy: string;
  botUserId: string;
  scopes: string;
  nangoConnectionId: string;
}): Promise<SlackWorkspace | null> {
  try {
    const db = getAgentsDb();
    const now = new Date();

    const insertData = {
      ...data,
      teamDomain: data.teamDomain || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert().values(insertData).returning();
    const workspace = result[0];

    if (!workspace) {
      console.error(`[SlackCredentials] Failed to save workspace for team: ${data.teamId}`);
      return null;
    }

    const mapped = workspace as SlackWorkspace;
    setCachedWorkspace(data.teamId, mapped);
    console.log(`[SlackCredentials] Saved workspace for team: ${data.teamId}`);

    return mapped;
  } catch (error) {
    console.error(`[SlackCredentials] Error saving workspace for team ${data.teamId}:`, error);
    return null;
  }
}

/**
 * Update an existing Slack workspace
 *
 * TODO: Replace with agents-core implementation once monorepo is set up
 */
export async function updateSlackWorkspace(
  teamId: string,
  data: Partial<
    Pick<SlackWorkspace, 'teamName' | 'teamDomain' | 'botUserId' | 'scopes' | 'isActive'>
  >
): Promise<SlackWorkspace | null> {
  try {
    const db = getAgentsDb();

    const updateData = { ...data, updatedAt: new Date() };
    const result = await db.update().set(updateData).where({ teamId }).returning();
    const workspace = result[0];

    if (!workspace) {
      console.error(`[SlackCredentials] Failed to update workspace for team: ${teamId}`);
      return null;
    }

    const mapped = workspace as SlackWorkspace;
    setCachedWorkspace(teamId, mapped);
    console.log(`[SlackCredentials] Updated workspace for team: ${teamId}`);

    return mapped;
  } catch (error) {
    console.error(`[SlackCredentials] Error updating workspace for team ${teamId}:`, error);
    return null;
  }
}

/**
 * Remove a Slack workspace (uninstall)
 *
 * TODO: Replace with agents-core implementation once monorepo is set up
 */
export async function deleteSlackWorkspace(teamId: string): Promise<boolean> {
  try {
    const db = getAgentsDb();
    await db.delete().where({ teamId });

    // Clear caches
    tokenCache.delete(teamId);
    workspaceCache.delete(teamId);

    console.log(`[SlackCredentials] Deleted workspace for team: ${teamId}`);
    return true;
  } catch (error) {
    console.error(`[SlackCredentials] Error deleting workspace for team ${teamId}:`, error);
    return false;
  }
}

// ============================================================
// Cache Utilities
// ============================================================

/**
 * Invalidate cached credentials for a workspace
 */
export function invalidateCache(teamId: string): void {
  tokenCache.delete(teamId);
  workspaceCache.delete(teamId);
  console.log(`[SlackCredentials] Cache invalidated for team: ${teamId}`);
}

/**
 * Clear all cached credentials
 */
export function clearAllCaches(): void {
  tokenCache.clear();
  workspaceCache.clear();
  console.log('[SlackCredentials] All caches cleared');
}

// ============================================================
// Aliases
// ============================================================

export { getSlackWorkspaceByTeamId as getWorkspaceByTeamId };
