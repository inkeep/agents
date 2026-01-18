import { type NextRequest, NextResponse } from 'next/server';

/**
 * Nango OAuth Callback Redirect (Cloud Deployment Only)
 *
 * This endpoint redirects OAuth callbacks to Nango's API while preserving all query parameters.
 * Only active when PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT=true.
 *
 * Configure this route in:
 * - Nango Dashboard > Environment Settings > Callback URL
 * - OAuth Providers (Google, Slack, etc.) > Authorized Redirect URIs
 */
export async function GET(request: NextRequest) {
  // Only enable this route for cloud deployments
  const isCloudDeployment =
    process.env.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true' ||
    process.env.NEXT_PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  if (!isCloudDeployment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const nangoServerUrl =
    process.env.PUBLIC_NANGO_SERVER_URL ||
    process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
    process.env.NANGO_SERVER_URL ||
    'https://api.nango.dev';

  const nangoCallbackUrl = new URL(`${nangoServerUrl}/oauth/callback`);

  // Pass along ALL original query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    nangoCallbackUrl.searchParams.set(key, value);
  });

  // Use 308 Permanent Redirect to preserve the HTTP method
  return NextResponse.redirect(nangoCallbackUrl.toString(), 308);
}
