import { useEffect, useState } from 'react';
import { useAuthClient } from '@/lib/auth-client';

export function useAuthSession() {
  const client = useAuthClient();
  const { data: session, isPending, error } = client.useSession();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending || !isHydrated,
    isAuthenticated: isHydrated && !isPending && !!session,
    error,
  };
}
