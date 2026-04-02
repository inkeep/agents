'use client';

import { useAuthClient } from '@/contexts/auth-client';

export function useSignOut() {
  const authClient = useAuthClient();

  async function signOut() {
    try {
      await authClient.signOut();
    } finally {
      if (process.env.NODE_ENV === 'development') {
        document.cookie = 'dev-logged-out=1; path=/; max-age=86400; SameSite=Lax';
      }
      window.location.href = '/login';
    }
  }

  return signOut;
}
