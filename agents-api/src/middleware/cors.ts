import type { cors } from 'hono/cors';
import { env } from '../env';

type CorsOptions = Parameters<typeof cors>[0];

/**
 * Extract the base domain from a hostname (e.g., 'app.preview.inkeep.com' -> 'preview.inkeep.com')
 */
export function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return hostname;
}

/**
 * Extract the registrable domain (eTLD+1) from a hostname.
 * e.g., 'api.agents.inkeep.com' -> 'inkeep.com', 'app.inkeep.com' -> 'inkeep.com'
 */
export function getRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

/**
 * Check if a request origin is allowed for CORS
 * Development: Allow any localhost origin
 * Production: Allow same base domain, same root domain (when UI URL is configured), or configured UI URL
 */
export function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;

  try {
    const requestUrl = new URL(origin);
    const apiUrl = new URL(env.INKEEP_AGENTS_API_URL || 'http://localhost:3002');
    const uiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL ? new URL(env.INKEEP_AGENTS_MANAGE_UI_URL) : null;

    if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
      return true;
    }

    if (uiUrl && requestUrl.hostname === uiUrl.hostname) {
      return true;
    }

    const requestBaseDomain = getBaseDomain(requestUrl.hostname);
    const apiBaseDomain = getBaseDomain(apiUrl.hostname);
    if (requestBaseDomain === apiBaseDomain) {
      return true;
    }

    // When the UI URL is explicitly configured, also allow origins that share the same
    // root domain (eTLD+1) as both the API and UI. This handles domain structures where
    // the API and UI don't share a 3-part parent (e.g., api.agents.inkeep.com + app.inkeep.com).
    if (uiUrl) {
      const requestRootDomain = getRootDomain(requestUrl.hostname);
      const apiRootDomain = getRootDomain(apiUrl.hostname);
      const uiRootDomain = getRootDomain(uiUrl.hostname);
      if (
        requestRootDomain === apiRootDomain &&
        apiRootDomain === uiRootDomain &&
        requestRootDomain === uiRootDomain
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

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
 * CORS configuration for run routes (streaming, more permissive)
 */
export const runCorsConfig: CorsOptions = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['*'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
};

/**
 * CORS configuration for SigNoz proxy routes
 */
export const signozCorsConfig: CorsOptions = {
  origin: originHandler,
  allowHeaders: [
    'content-type',
    'Content-Type',
    'authorization',
    'Authorization',
    'User-Agent',
    'Cookie',
    'X-Forwarded-Cookie',
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Set-Cookie'],
  maxAge: 600,
  credentials: true,
};
