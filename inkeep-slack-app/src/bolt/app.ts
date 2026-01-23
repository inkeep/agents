// ============================================================
// src/bolt/app.ts
// Bolt.js app initialization with multi-workspace support
// ============================================================

import { App, type AuthorizeResult, LogLevel } from '@slack/bolt';
import { VercelReceiver } from '@vercel/slack-bolt';
import { getEnv } from '@/lib/env';
import { getSlackBotToken, getSlackWorkspaceByTeamId } from '@/lib/slack-credentials';

// ============================================================
// Configuration
// ============================================================

const env = getEnv();
const isDev = process.env.NODE_ENV === 'development';

// ============================================================
// Vercel Receiver
// ============================================================

/**
 * Vercel receiver handles HTTP and signature verification
 * Designed for serverless deployment on Vercel
 */
export const receiver = new VercelReceiver({
  signingSecret: env.SLACK_SIGNING_SECRET,
});

// ============================================================
// Multi-Workspace Authorization
// ============================================================

/**
 * Multi-workspace authorize function
 * Fetches bot tokens dynamically based on the workspace (teamId)
 *
 * Flow:
 * 1. Look up workspace in DB by teamId
 * 2. Fetch bot token from Nango using nangoConnectionId
 * 3. Return token + bot info to Bolt
 *
 * Fallback (dev only):
 * - Uses SLACK_BOT_TOKEN env var if workspace lookup fails
 */
async function authorize({
  teamId,
  enterpriseId,
}: {
  teamId?: string;
  enterpriseId?: string;
}): Promise<AuthorizeResult> {
  // Handle URL verification challenges (Slack doesn't send teamId)
  if (!teamId) {
    console.error('[Bolt authorize] No teamId provided');
    if (env.SLACK_BOT_TOKEN) {
      console.warn('[Bolt authorize] Using SLACK_BOT_TOKEN fallback (no teamId)');
      return { botToken: env.SLACK_BOT_TOKEN };
    }
    throw new Error('No teamId provided and no fallback token available');
  }

  try {
    const workspace = await getSlackWorkspaceByTeamId(teamId);

    if (!workspace) {
      console.warn(`[Bolt authorize] Workspace not found for team: ${teamId}`);
      if (env.SLACK_BOT_TOKEN) {
        console.warn('[Bolt authorize] Using SLACK_BOT_TOKEN fallback (dev only)');
        return { botToken: env.SLACK_BOT_TOKEN };
      }
      throw new Error(`Workspace not found for team: ${teamId}`);
    }

    const botToken = await getSlackBotToken(teamId);

    if (!botToken) {
      console.error(`[Bolt authorize] No token available for team: ${teamId}`);
      throw new Error(`No token available for team: ${teamId}`);
    }

    console.log(`[Bolt authorize] Authorized team: ${teamId}`);

    return {
      botToken,
      botId: workspace.botUserId || undefined,
      botUserId: workspace.botUserId || undefined,
      teamId: workspace.teamId,
      enterpriseId: enterpriseId || undefined,
    };
  } catch (error) {
    console.error('[Bolt authorize] Error:', error);
    if (env.SLACK_BOT_TOKEN) {
      console.warn('[Bolt authorize] Using SLACK_BOT_TOKEN fallback after error');
      return { botToken: env.SLACK_BOT_TOKEN };
    }
    throw error;
  }
}

// ============================================================
// Bolt App Instance
// ============================================================

/**
 * Bolt app configured for multi-workspace support
 * - Uses VercelReceiver for serverless deployment
 * - Uses dynamic authorize for multi-tenant token management
 */
export const app = new App({
  receiver,
  authorize,
  logLevel: isDev ? LogLevel.DEBUG : LogLevel.INFO,
});

/**
 * Slack Web API client for direct API calls
 *
 * WARNING: For multi-workspace apps, prefer using the client from event context:
 *   app.event("...", async ({ client }) => { ... })
 *
 * This exported client requires you to pass the token explicitly:
 *   slack.chat.postMessage({ token: botToken, channel, text })
 */
export const slack = app.client;

// ============================================================
// Listener Registration
// ============================================================

let listenersRegistered = false;

/**
 * Register Bolt event listeners
 * Must be called after app is exported to avoid circular dependencies
 */
export function registerListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const { register } = require('./listeners');
  register(app);
}

// ============================================================
// Exports
// ============================================================

export { getEnv };
