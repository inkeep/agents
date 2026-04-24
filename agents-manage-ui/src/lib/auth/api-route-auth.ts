import type { ProjectPermissionLevel, ProjectPermissions } from '@inkeep/agents-core';
import { isAuthCookie } from '@inkeep/agents-core/auth/cookie-names';
import { NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';

interface SessionPayload {
  session: Record<string, unknown>;
  user: {
    id: string;
    email?: string;
  };
}

interface ApiRouteAuthSuccess {
  ok: true;
  cookieHeader: string;
  session: SessionPayload;
}

interface ApiRouteSessionOrBearerSuccess {
  ok: true;
  authType: 'session' | 'bearer';
  headers: Record<string, string>;
  cookieHeader?: string;
  authorizationHeader?: string;
  session?: SessionPayload;
}

interface ApiRouteAuthFailure {
  ok: false;
  response: NextResponse;
}

type ApiRouteAuthResult = ApiRouteAuthSuccess | ApiRouteAuthFailure;
type ApiRouteSessionOrBearerResult = ApiRouteSessionOrBearerSuccess | ApiRouteAuthFailure;

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function internalErrorResponse(message = 'Failed to validate authentication') {
  return NextResponse.json({ error: message }, { status: 500 });
}

const BEARER_PREFIX = 'Bearer ';

function getBearerAuthorizationHeader(authorizationHeader: string | null): string | null {
  const normalizedHeader = authorizationHeader?.trim();
  const token = normalizedHeader?.startsWith(BEARER_PREFIX)
    ? normalizedHeader.slice(BEARER_PREFIX.length).trim()
    : '';
  return token ? `${BEARER_PREFIX}${token}` : null;
}

export function filterAuthCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const authCookies = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .filter((cookie) => {
      const separatorIndex = cookie.indexOf('=');
      const cookieName = separatorIndex === -1 ? cookie : cookie.slice(0, separatorIndex);
      return isAuthCookie(cookieName);
    });

  return authCookies.length ? authCookies.join('; ') : null;
}

async function fetchSession(cookieHeader: string): Promise<SessionPayload | null> {
  const response = await fetch(`${getAgentsApiUrl()}/api/auth/get-session`, {
    headers: {
      cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }

    throw new Error(`Session validation failed with status ${response.status}`);
  }

  const session: SessionPayload | null = await response.json();

  if (!session?.session || !session.user?.id) {
    return null;
  }

  return session;
}

async function fetchProjectPermissions(
  cookieHeader: string,
  tenantId: string,
  projectId: string
): Promise<Response> {
  return fetch(
    `${getAgentsApiUrl()}/manage/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/permissions`,
    {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    }
  );
}

export async function requireApiRouteSession(request: Request): Promise<ApiRouteAuthResult> {
  const cookieHeader = filterAuthCookieHeader(request.headers.get('cookie'));

  if (!cookieHeader) {
    return {
      ok: false,
      response: unauthorizedResponse(),
    };
  }

  try {
    const session = await fetchSession(cookieHeader);

    if (!session) {
      return {
        ok: false,
        response: unauthorizedResponse(),
      };
    }

    return {
      ok: true,
      cookieHeader,
      session,
    };
  } catch {
    return {
      ok: false,
      response: internalErrorResponse(),
    };
  }
}

export async function requireApiRouteSessionOrBearer(
  request: Request
): Promise<ApiRouteSessionOrBearerResult> {
  const authorizationHeader = getBearerAuthorizationHeader(request.headers.get('authorization'));

  if (authorizationHeader) {
    return {
      ok: true,
      authType: 'bearer',
      authorizationHeader,
      headers: {
        Authorization: authorizationHeader,
      },
    };
  }

  const authResult = await requireApiRouteSession(request);
  if (!authResult.ok) {
    return authResult;
  }

  return {
    ok: true,
    authType: 'session',
    cookieHeader: authResult.cookieHeader,
    session: authResult.session,
    headers: {
      Cookie: authResult.cookieHeader,
    },
  };
}

export async function requireApiRouteProjectPermission(
  request: Request,
  {
    tenantId,
    projectId,
    level,
  }: {
    tenantId: string;
    projectId: string;
    level: ProjectPermissionLevel;
  }
): Promise<ApiRouteAuthResult> {
  const authResult = await requireApiRouteSession(request);

  if (!authResult.ok) {
    return authResult;
  }

  try {
    const response = await fetchProjectPermissions(authResult.cookieHeader, tenantId, projectId);

    if (response.status === 401) {
      return {
        ok: false,
        response: unauthorizedResponse(),
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        response: forbiddenResponse(),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        response: internalErrorResponse('Failed to validate project access'),
      };
    }

    const payload: { data?: ProjectPermissions } = await response.json();
    const permissions = payload.data;

    if (!permissions) {
      return {
        ok: false,
        response: internalErrorResponse('Failed to validate project access'),
      };
    }

    const hasPermission =
      level === 'edit'
        ? permissions.canEdit
        : level === 'use'
          ? permissions.canUse
          : permissions.canView;

    if (!hasPermission) {
      return {
        ok: false,
        response: forbiddenResponse(),
      };
    }

    return authResult;
  } catch {
    return {
      ok: false,
      response: internalErrorResponse('Failed to validate project access'),
    };
  }
}
