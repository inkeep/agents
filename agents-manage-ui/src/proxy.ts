import { type NextRequest, NextResponse } from 'next/server';
import { DEFAULT_NEW_AGENT_PANE } from './hooks/use-side-pane';

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.endsWith('/agents/new') && !searchParams.has('pane')) {
    const url = request.nextUrl.clone();
    url.searchParams.set('pane', DEFAULT_NEW_AGENT_PANE);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:tenantId/projects/:projectId/agents/new',
};
