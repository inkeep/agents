'use client';

import { useCallback } from 'react';
import { useAuthClient } from '@/contexts/auth-client';

export function useSignOut() {
  const authClient = useAuthClient();

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      if (process.env.NODE_ENV === 'development') {
        document.cookie = 'dev-logged-out=1; path=/; max-age=86400; SameSite=Lax';
      }
      window.location.href = '/login';
    }
  }, [authClient]);

  return signOut;
}
