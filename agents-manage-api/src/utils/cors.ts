import type { cors } from 'hono/cors';
import { env } from '../env';

type CorsOptions = Parameters<typeof cors>[0];

/**
 * Extract the base domain from a hostname (e.g., 'app.preview.inkeep.com' -> 'preview.inkeep.com')
 * For hostnames with 3+ parts, returns the last 3 parts (subdomain.domain.tld)
 * For hostnames with 2 parts, returns as-is (domain.tld)
 */
export function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  // For hostnames like 'agents-manage-ui.preview.inkeep.com', get 'preview.inkeep.com'
  if (parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return hostname;
}

/**
 * Check if a request origin is allowed for CORS
 *
 * Development: Allow any localhost origin
 * Production/Preview: Allow the specific UI URL, or any subdomain of the same base domain
 *
 * @returns true if origin is allowed (also narrows type to string)
 */
export function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;

  try {
    const requestUrl = new URL(origin);
    const apiUrl = new URL(env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002');
    const uiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL ? new URL(env.INKEEP_AGENTS_MANAGE_UI_URL) : null;

    // Development: allow any localhost
    if (apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1') {
      return requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
    }

    // Allow the specific UI URL if configured
    if (uiUrl && requestUrl.hostname === uiUrl.hostname) {
      return true;
    }

    // Production: allow origins from the same base domain as the API URL
    // This handles cases like agents-manage-ui.preview.inkeep.com -> agents-manage-api.preview.inkeep.com
    const requestBaseDomain = getBaseDomain(requestUrl.hostname);
    const apiBaseDomain = getBaseDomain(apiUrl.hostname);
    if (requestBaseDomain === apiBaseDomain) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Origin handler for CORS middleware
 */
const originHandler = (origin: string | undefined) => (isOriginAllowed(origin) ? origin : null);

/**
 * CORS configuration for auth routes (Better Auth, session endpoints)
 */
export const authCorsConfig: CorsOptions = {
  origin: originHandler,
  allowHeaders: ['content-type', 'Content-Type', 'authorization', 'Authorization', 'User-Agent'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
};

/**
 * CORS configuration for playground routes
 */
export const playgroundCorsConfig: CorsOptions = {
  origin: originHandler,
  allowHeaders: ['content-type', 'Content-Type', 'authorization', 'Authorization', 'User-Agent'],
  allowMethods: ['POST', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
};

/**
 * CORS configuration for default API routes
 */
export const defaultCorsConfig: CorsOptions = {
  origin: originHandler,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['*'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
};
