import { useAuthClient } from '@/lib/auth-client';

export function useAuthSession() {
  const client = useAuthClient();

  const { data: session, isPending, error } = client.useSession();

  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending,
    isAuthenticated: !!session,
    error,
  };
}
