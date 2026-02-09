import { type NextRequest, NextResponse } from 'next/server';

/**
 * Composio OAuth Callback Redirect (Cloud Deployment Only)
 *
 * This endpoint redirects OAuth callbacks to Composio's API while preserving all query parameters.
 * Only active when PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT=true.
 *
 * Configure this route in:
 * - Composio Dashboard > Auth Config > Custom Redirect URI
 * - OAuth Providers (Google, Slack, etc.) > Authorized Redirect URIs
 *
 * @see https://docs.composio.dev/docs/custom-auth-configs#white-labeling-the-oauth-consent-screen
 */
export async function GET(request: NextRequest) {
  // Only enable this route for cloud deployments
  const isCloudDeployment =
    process.env.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true' ||
    process.env.NEXT_PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  if (!isCloudDeployment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const composioCallbackUrl = new URL('https://backend.composio.dev/api/v3/toolkits/auth/callback');

  // Pass along ALL original query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    composioCallbackUrl.searchParams.set(key, value);
  });

  // Use 302 redirect as recommended by Composio docs
  return NextResponse.redirect(composioCallbackUrl.toString(), 302);
}
