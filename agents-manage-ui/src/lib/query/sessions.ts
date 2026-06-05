'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { useAuthClient } from '@/contexts/auth-client';

const SESSIONS_QUERY_KEY = ['sessions'] as const;

export interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  activeOrganizationId?: string | null;
}

// agents-cli sends `inkeep-cli/<version> node/<v> <platform>/<arch>` so its sessions
// are identifiable in the list. ua-parser-js doesn't recognize CLI tool patterns
// (not even `curl` or `npm`), so we detect it before falling through.
const INKEEP_CLI_UA = /^inkeep-cli\/([\d.]+)/i;

export function parseDeviceDescriptor(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const cliMatch = userAgent.match(INKEEP_CLI_UA);
  if (cliMatch) return `Inkeep CLI ${cliMatch[1]}`;
  try {
    const result = new UAParser(userAgent).getResult();
    const browser = result.browser?.name?.trim();
    const os = result.os?.name?.trim();
    if (browser && os) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return os;
    return 'Unknown device';
  } catch {
    return 'Unknown device';
  }
}

export function formatNullableField(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return value;
}

export function sortSessions<T extends { id: string; updatedAt: string | Date }>(
  sessions: T[],
  currentSessionId: string | null | undefined
): T[] {
  if (sessions.length <= 1) return [...sessions];

  const current = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : undefined;
  const rest = current ? sessions.filter((s) => s.id !== current.id) : [...sessions];

  rest.sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  return current ? [current, ...rest] : rest;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  return candidate.status === 404 || candidate.statusCode === 404;
}

export function useSessionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const authClient = useAuthClient();

  return useQuery<SessionRow[]>({
    queryKey: SESSIONS_QUERY_KEY,
    async queryFn() {
      const result = await authClient.listSessions();
      if (result?.error) {
        throw new Error(result.error.message || 'Failed to load sessions');
      }
      return (result?.data ?? []) as unknown as SessionRow[];
    },
    enabled,
    initialData: [],
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to load sessions',
    },
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  const authClient = useAuthClient();

  return useMutation<void, Error, { token: string }>({
    async mutationFn({ token }) {
      let result: Awaited<ReturnType<typeof authClient.revokeSession>>;
      try {
        result = await authClient.revokeSession({ token });
      } catch (err) {
        if (isNotFoundError(err)) return;
        throw err instanceof Error ? err : new Error('Failed to revoke session');
      }
      if (result?.error) {
        if (isNotFoundError(result.error)) return;
        throw new Error(result.error.message || 'Failed to revoke session');
      }
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      toast.success('Session revoked');
    },
    onError(error) {
      toast.error(error.message || 'Failed to revoke session');
    },
    meta: {
      defaultError: 'Failed to revoke session',
    },
  });
}

export function useRevokeOtherSessionsMutation() {
  const queryClient = useQueryClient();
  const authClient = useAuthClient();

  return useMutation<void, Error, void>({
    async mutationFn() {
      const result = await authClient.revokeOtherSessions();
      if (result?.error) {
        throw new Error(result.error.message || 'Failed to revoke other sessions');
      }
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      toast.success('All other sessions revoked');
    },
    onError(error) {
      toast.error(error.message || 'Failed to revoke other sessions');
    },
    meta: {
      defaultError: 'Failed to revoke other sessions',
    },
  });
}
