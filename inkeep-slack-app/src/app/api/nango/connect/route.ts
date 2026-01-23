// ============================================================
// src/app/api/nango/connect/route.ts
// Creates Nango Connect Session for frontend-initiated OAuth
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { createConnectSession } from '@/lib/nango';

export const runtime = 'nodejs';

/**
 * POST /api/nango/connect
 *
 * Alternative to /api/slack/install for frontend-controlled OAuth.
 * Frontend calls this endpoint, receives connect URL, then redirects.
 *
 * Request body:
 * - endUserId (optional): Unique identifier for the installation
 * - organization (optional): { id, displayName }
 * - metadata (optional): Additional metadata
 *
 * Flow:
 * 1. Frontend calls POST /api/nango/connect
 * 2. Backend creates a Nango Connect Session
 * 3. Return the connect URL to frontend
 * 4. Frontend redirects user to that URL
 * 5. Nango handles OAuth and sends webhook with connectionId
 */
export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const body = await request.json().catch(() => ({}));

    // Create unique end_user ID for this installation
    const endUserId = body.endUserId || `${env.INKEEP_TENANT_ID}:${env.PROJECT_ID}:${Date.now()}`;

    // Add timeout for external API call
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 10000)
    );

    const sessionPromise = createConnectSession({
      endUserId,
      organization: body.organization,
      metadata: body.metadata,
    });

    const session = await Promise.race([sessionPromise, timeoutPromise]);

    if (!session) {
      console.error('[NangoConnect] Failed to create session');
      return NextResponse.json({ error: 'Failed to create connect session' }, { status: 500 });
    }

    console.log(`[NangoConnect] Created session for: ${endUserId}`);

    return NextResponse.json({
      connectUrl: session.connectUrl,
      sessionToken: session.sessionToken,
    });
  } catch (error) {
    console.error('[NangoConnect] Error:', error);
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
  }
}
