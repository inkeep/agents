import { useEffect, useState } from 'react';
import { useAuthClient } from '@/lib/auth-client';

export function useAuthSession() {
  const client = useAuthClient();
  const { data: session, isPending, error } = client.useSession();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return {
    user: isMounted ? (session?.user ?? null) : null,
    session: isMounted ? (session?.session ?? null) : null,
    isLoading: !isMounted || isPending,
    isAuthenticated: isMounted && !isPending && !!session,
    error: isMounted ? error : null,
  };
}
