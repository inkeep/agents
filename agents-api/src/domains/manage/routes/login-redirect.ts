import { Hono } from 'hono';
import { env } from '../../../env';

const app = new Hono();

/**
 * OAuth Login Redirect Route
 * GET /login
 *
 * WHY THIS EXISTS:
 * ================
 * This is a redirect helper for the OAuth authorization flow. The actual login UI
 * lives in manage-ui (a separate Next.js app), but Better Auth's OAuth provider
 * is configured in agents-api.
 *
 * THE PROBLEM:
 * When Better Auth detects an unauthenticated user during OAuth, it redirects to
 * the configured `loginPage`. If we pointed directly to manage-ui's login page,
 * after login the user would be redirected to manage-ui's home page, abandoning
 * the OAuth flow.
 *
 * THE SOLUTION:
 * This route intercepts the login redirect and forwards to manage-ui's login page
 * WITH a `returnUrl` parameter. After successful login, manage-ui redirects the
 * user back to agents-api's authorize endpoint, where Better Auth resumes the
 * OAuth flow from the stored state.
 *
 * FLOW:
 * 1. Nango → agents-api/api/auth/oauth2/authorize (user not logged in)
 * 2. Better Auth → agents-api/login (this route)
 * 3. This route → manage-ui/login?returnUrl=agents-api/api/auth/oauth2/authorize
 * 4. User logs in → manage-ui redirects to returnUrl
 * 5. agents-api/api/auth/oauth2/authorize (now with session, resumes OAuth)
 * 6. → consent page → Nango callback with auth code
 */
app.get('/', async (c) => {
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:4444';
  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  // After login, send user back to the OAuth authorize endpoint.
  // Better Auth stores the pending OAuth request state in cookies/session,
  // so it will automatically resume the authorization flow.
  const returnUrl = `${apiUrl}/api/auth/oauth2/authorize`;

  // Build the full login URL with returnUrl parameter
  const loginUrl = new URL('/login', manageUiUrl);
  loginUrl.searchParams.set('returnUrl', returnUrl);

  return c.redirect(loginUrl.toString());
});

export default app;
