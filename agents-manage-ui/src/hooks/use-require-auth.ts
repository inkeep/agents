'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { buildLoginUrlWithCurrentPath } from '@/lib/utils/auth-redirect';
import { useAuthSession } from './use-auth';

/**
 * Client-side auth guard hook. Redirects to login if the user session
 * is not present after loading completes. Use as defense-in-depth
 * alongside the server-side cookie check in the tenant layout.
 *
 * Handles the case where a session expires while the user is already
 * on a page (the server-side layout check only runs on initial render).
 */
export function useRequireAuth() {
  const { user, isLoading, isAuthenticated } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(buildLoginUrlWithCurrentPath());
    }
  }, [isLoading, user, router]);

  return { user, isLoading, isAuthenticated };
}
