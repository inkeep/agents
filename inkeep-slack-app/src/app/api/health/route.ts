// ============================================================
// src/app/api/health/route.ts
// Health check endpoint for monitoring and load balancers
// ============================================================

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/health
 *
 * Returns service health status for:
 * - Load balancer health checks
 * - Uptime monitoring
 * - Deployment verification
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'inkeep-slack-app',
    version: process.env.npm_package_version || '0.1.0',
  });
}
