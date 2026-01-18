import { useAuthClient } from '@/contexts/auth-client';

export function useAuthSession() {
  'use no memo';
  // TODO:
  // Can't optimize with react compiler due error
  // Error: Hooks must be the same function on every render, but this value may change over time to a different function.
  // See https://react.dev/reference/rules/react-calls-components-and-hooks#dont-dynamically-use-hooks
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
