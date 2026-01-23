// ============================================================
// src/app/api/slack/callback/route.ts
// OAuth callback / success page redirect
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/slack/callback
 *
 * Nango redirects here after successful OAuth.
 * We redirect to the connect pages.
 *
 * Query params from Nango:
 * - connectionId: The new Nango connection ID
 * - providerConfigKey: The integration ID (e.g., "slack")
 * - error: Error message if OAuth failed
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const connectionId = searchParams.get('connectionId');
  const providerConfigKey = searchParams.get('providerConfigKey');
  const error = searchParams.get('error');

  const env = getEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  // Handle OAuth errors
  if (error) {
    console.error(`[SlackCallback] OAuth error: ${error}`);
    return NextResponse.redirect(`${appUrl}/connect?error=${encodeURIComponent(error)}`);
  }

  // Log successful connection
  if (connectionId) {
    console.log(`[SlackCallback] OAuth success: ${connectionId} (${providerConfigKey})`);
  }

  // Redirect to success page
  // The workspace should be created by the Nango webhook by now
  return NextResponse.redirect(`${appUrl}/connect/success`);
}
