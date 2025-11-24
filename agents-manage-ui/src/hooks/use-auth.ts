import { useEffect, useState } from 'react';
import { useAuthClient } from '@/lib/auth-client';

export function useAuthSession() {
  const client = useAuthClient();
  const { data: session, isPending, error } = client.useSession();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return {
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      error: null,
    };
  }

  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending,
    isAuthenticated: !isPending && !!session,
    error,
  };
}
