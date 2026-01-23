// ============================================================
// src/app/api/slack/events/route.ts
// Slack Events API endpoint (Bolt.js with Vercel receiver)
// Multi-workspace support via authorize function in bolt/app.ts
// ============================================================

import { NextResponse } from 'next/server';
import { app, receiver, registerListeners } from '@/bolt/app';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow longer operations (Vercel Pro/Enterprise)

// Register Bolt listeners on cold start
registerListeners();

// Initialize receiver with app (connects authorize function)
receiver.init(app);

// Get the Vercel-compatible handler
const handler = receiver.toHandler();

/**
 * POST /api/slack/events
 *
 * Handles all Slack events including:
 * - URL verification challenge (handled by VercelReceiver)
 * - Messages, app_mention, reactions, etc.
 * - Multi-workspace: tokens fetched dynamically via authorize()
 */
export async function POST(request: Request) {
  return handler(request);
}

/**
 * GET /api/slack/events
 *
 * Health check for the events endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'slack/events',
    timestamp: new Date().toISOString(),
  });
}
