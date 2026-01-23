// ============================================================
// src/app/api/nango/webhook/route.ts
// Nango webhook handler for OAuth and connection events
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAgentsDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { getNango } from '@/lib/nango';
import {
  type SlackWorkspace,
  saveSlackWorkspace,
  updateSlackWorkspace,
} from '@/lib/slack-credentials';

/**
 * TODO: Replace with actual agents-core imports once monorepo is set up:
 * import {
 *   createSlackWorkspace,
 *   updateSlackWorkspace,
 *   getSlackWorkspaceByTeamId,
 *   generateSlackWorkspaceId,
 * } from '@inkeep/agents-core/data-access/manage/slack';
 */

export const runtime = 'nodejs';

// ============================================================
// Schema
// ============================================================

const NangoWebhookSchema = z.object({
  type: z.enum(['auth', 'connection.deleted', 'connection.updated']),
  connectionId: z.string().min(1),
  providerConfigKey: z.string().min(1),
  connection: z
    .object({
      credentials: z
        .object({
          team: z
            .object({
              id: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
          bot_user_id: z.string().optional(),
          scope: z.string().optional(),
          authed_user: z
            .object({
              id: z.string().optional(),
            })
            .optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

type NangoWebhookPayload = z.infer<typeof NangoWebhookSchema>;

// ============================================================
// Webhook Handler
// ============================================================

/**
 * POST /api/nango/webhook
 *
 * KEY POINT: When Nango completes OAuth, it sends a webhook with the
 * randomly-generated connectionId. We MUST store this connectionId
 * on our workspace record because we can't derive it from teamId.
 *
 * Events:
 * - auth: New connection created (OAuth completed)
 * - connection.deleted: Connection removed
 * - connection.updated: Connection updated (token refresh, etc.)
 */
export async function POST(request: NextRequest) {
  const env = getEnv();
  const nango = getNango();
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  // Verify webhook signature using Nango SDK
  let payload: NangoWebhookPayload;
  try {
    const verified = await nango.verifyIncomingWebhookRequest(rawBody, headers);
    payload = NangoWebhookSchema.parse(verified);
  } catch (error) {
    console.error('[NangoWebhook] Signature verification or validation failed:', error);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 401 });
  }

  const { type, connectionId, providerConfigKey } = payload;

  console.log(`[NangoWebhook] Received: type=${type}, connectionId=${connectionId}`);

  // Only process Slack connections
  if (providerConfigKey !== env.NANGO_INTEGRATION_ID) {
    console.log(`[NangoWebhook] Skipping non-Slack connection: ${providerConfigKey}`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    switch (type) {
      case 'auth':
        return handleAuthEvent(payload, env);

      case 'connection.deleted':
        return handleConnectionDeleted(connectionId);

      case 'connection.updated':
        return handleConnectionUpdated(connectionId);

      default:
        console.log(`[NangoWebhook] Unhandled event: ${type}`);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error('[NangoWebhook] Error:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle OAuth completion - create or update workspace
 */
async function handleAuthEvent(payload: NangoWebhookPayload, env: ReturnType<typeof getEnv>) {
  const { connectionId, connection } = payload;
  const credentials = connection?.credentials || {};

  // Extract team info from Slack OAuth response
  const teamId = credentials.team?.id;
  const teamName = credentials.team?.name || 'Unknown';
  const botUserId = credentials.bot_user_id || '';
  const scopes = credentials.scope || '';
  const installedBy = credentials.authed_user?.id || '';

  if (!teamId) {
    console.error('[NangoWebhook] Missing team_id in credentials');
    return NextResponse.json({ error: 'Missing team_id' }, { status: 400 });
  }

  // Try to find existing workspace
  const db = getAgentsDb();
  const existing = (await db.query.slackWorkspaces.findFirst({
    where: { teamId },
  })) as SlackWorkspace | null;

  if (existing) {
    // Update existing workspace with NEW connectionId (handles re-installations)
    const updated = await updateSlackWorkspace(teamId, {
      teamName,
      botUserId,
      scopes,
      isActive: true,
    });

    if (updated) {
      console.log(
        `[NangoWebhook] Updated workspace: teamId=${teamId}, connectionId=${connectionId}`
      );
      return NextResponse.json({ ok: true, workspaceId: updated.id, action: 'updated' });
    }
  } else {
    // Create new workspace
    const created = await saveSlackWorkspace({
      tenantId: env.INKEEP_TENANT_ID,
      projectId: env.PROJECT_ID,
      teamId,
      teamName,
      installedBy,
      botUserId,
      scopes,
      nangoConnectionId: connectionId,
    });

    if (created) {
      console.log(
        `[NangoWebhook] Created workspace: teamId=${teamId}, connectionId=${connectionId}`
      );
      return NextResponse.json({ ok: true, workspaceId: created.id, action: 'created' });
    }
  }

  console.error(`[NangoWebhook] Failed to save workspace for team: ${teamId}`);
  return NextResponse.json({ error: 'Failed to save workspace' }, { status: 500 });
}

/**
 * Handle connection deletion - deactivate workspace
 */
async function handleConnectionDeleted(connectionId: string) {
  const db = getAgentsDb();

  try {
    // Find workspaces by connectionId
    const workspaces = (await db.query.slackWorkspaces.findMany({
      where: { nangoConnectionId: connectionId },
    })) as SlackWorkspace[];

    for (const workspace of workspaces) {
      await updateSlackWorkspace(workspace.teamId, { isActive: false });
      console.log(`[NangoWebhook] Deactivated workspace: ${workspace.teamId}`);
    }

    return NextResponse.json({ ok: true, deactivated: workspaces.length });
  } catch (error) {
    console.error('[NangoWebhook] Error handling connection.deleted:', error);
    return NextResponse.json({ ok: true, error: 'Partial failure' });
  }
}

/**
 * Handle connection update - reactivate workspace if needed
 */
async function handleConnectionUpdated(connectionId: string) {
  const db = getAgentsDb();

  try {
    // Find workspaces by connectionId
    const workspaces = (await db.query.slackWorkspaces.findMany({
      where: { nangoConnectionId: connectionId },
    })) as SlackWorkspace[];

    for (const workspace of workspaces) {
      await updateSlackWorkspace(workspace.teamId, { isActive: true });
      console.log(`[NangoWebhook] Reactivated workspace: ${workspace.teamId}`);
    }

    return NextResponse.json({ ok: true, updated: workspaces.length });
  } catch (error) {
    console.error('[NangoWebhook] Error handling connection.updated:', error);
    return NextResponse.json({ ok: true, error: 'Partial failure' });
  }
}
