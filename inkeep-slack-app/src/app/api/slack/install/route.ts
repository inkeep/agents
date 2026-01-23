// ============================================================
// src/app/api/slack/install/route.ts
// Initiates Slack OAuth flow via Nango Connect
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';

import { createConnectSession } from '@/lib/nango';

export const runtime = 'nodejs';

/**
 * GET /api/slack/install
 *
 * Query params:
 * - tenantId (required): The tenant installing the app
 * - projectId (optional): Specific project context
 *
 * Flow:
 * 1. Create a Nango Connect Session
 * 2. Redirect user to Nango's hosted OAuth page
 * 3. Nango handles OAuth with Slack
 * 4. Nango sends webhook to /api/nango/webhook with connectionId
 * 5. We store connectionId on the workspace record
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tenantId = searchParams.get('tenantId');
  const projectId = searchParams.get('projectId') || 'default';

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing required parameter: tenantId' }, { status: 400 });
  }

  try {
    // Create unique end user ID for this installation
    const endUserId = `${tenantId}:${projectId}`;

    const session = await createConnectSession({
      endUserId,
      organization: {
        id: tenantId,
        displayName: tenantId,
      },
      metadata: {
        tenantId,
        projectId,
        initiatedAt: new Date().toISOString(),
      },
    });

    if (!session) {
      console.error('[SlackInstall] Failed to create Nango connect session');
      return NextResponse.json({ error: 'Failed to initiate OAuth flow' }, { status: 500 });
    }

    console.log(`[SlackInstall] Redirecting to Nango Connect for tenant: ${tenantId}`);

    return NextResponse.redirect(session.connectUrl);
  } catch (error) {
    console.error('[SlackInstall] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
