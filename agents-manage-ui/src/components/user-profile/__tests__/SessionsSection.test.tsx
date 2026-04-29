// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-auth', () => ({
  useAuthSession: vi.fn(),
}));

vi.mock('@/contexts/auth-client', () => ({
  useAuthClient: vi.fn(),
}));

vi.mock('@/lib/query/sessions', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/query/sessions')>('@/lib/query/sessions');
  return {
    ...actual,
    useSessionsQuery: vi.fn(),
    useRevokeSessionMutation: vi.fn(),
    useRevokeOtherSessionsMutation: vi.fn(),
  };
});

import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';
import {
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from '@/lib/query/sessions';
import { SessionsSection } from '../SessionsSection';

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseSessionsQuery = vi.mocked(useSessionsQuery);
const mockedUseAuthClient = vi.mocked(useAuthClient);
const mockedUseRevokeSessionMutation = vi.mocked(useRevokeSessionMutation);
const mockedUseRevokeOtherSessionsMutation = vi.mocked(useRevokeOtherSessionsMutation);

function authStateFor(currentSessionId: string | null) {
  return {
    user: currentSessionId ? ({ id: 'u1' } as never) : null,
    session: currentSessionId ? ({ id: currentSessionId } as never) : null,
    isLoading: false,
    isAuthenticated: !!currentSessionId,
    error: null,
  } as ReturnType<typeof useAuthSession>;
}

interface QueryStateOverrides {
  data?: unknown[];
  dataUpdatedAt?: number;
  isFetching?: boolean;
  isError?: boolean;
  error?: Error | null;
  refetch?: () => Promise<unknown>;
}

function queryStateFor(overrides: QueryStateOverrides = {}) {
  return {
    data: overrides.data ?? [],
    dataUpdatedAt: overrides.dataUpdatedAt ?? 0,
    isFetching: overrides.isFetching ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
    refetch: overrides.refetch ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useSessionsQuery>;
}

interface MutationStateOverrides {
  mutateAsync?: ReturnType<typeof vi.fn>;
  reset?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  isError?: boolean;
  error?: Error | null;
}

function mutationStateFor(overrides: MutationStateOverrides = {}) {
  return {
    mutateAsync: overrides.mutateAsync ?? vi.fn().mockResolvedValue(undefined),
    reset: overrides.reset ?? vi.fn(),
    isPending: overrides.isPending ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
  } as unknown as ReturnType<typeof useRevokeSessionMutation>;
}

function revokeOthersMutationStateFor(overrides: MutationStateOverrides = {}) {
  return mutationStateFor(overrides) as unknown as ReturnType<
    typeof useRevokeOtherSessionsMutation
  >;
}

interface SessionOverrides {
  updatedAt?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  token?: string;
}

function buildSession(id: string, overrides: SessionOverrides = {}) {
  return {
    id,
    userId: 'u1',
    token: overrides.token === undefined ? `tok-${id}` : overrides.token,
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00Z',
    ipAddress: overrides.ipAddress === undefined ? '127.0.0.1' : overrides.ipAddress,
    userAgent:
      overrides.userAgent === undefined
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
        : overrides.userAgent,
  };
}

let originalLocation: Location;
const locationStub = { href: '' };

beforeEach(() => {
  vi.clearAllMocks();
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: locationStub,
  });
  locationStub.href = '';
  mockedUseAuthClient.mockReturnValue({
    signOut: vi.fn().mockResolvedValue(undefined),
  } as never);
  mockedUseRevokeSessionMutation.mockReturnValue(mutationStateFor());
  mockedUseRevokeOtherSessionsMutation.mockReturnValue(revokeOthersMutationStateFor());
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe('SessionsSection', () => {
  it('renders the section heading and description', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({ data: [buildSession('s1')], dataUpdatedAt: Date.now() })
    );

    render(<SessionsSection />);

    expect(screen.getByText('Active sessions')).toBeInTheDocument();
    expect(screen.getByText(/devices currently signed in/i)).toBeInTheDocument();
  });

  it('renders 3 skeleton rows during the initial fetch', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(queryStateFor({ isFetching: true, dataUpdatedAt: 0 }));

    const { container } = render(<SessionsSection />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it('renders an inline error state with a retry button', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        isError: true,
        error: new Error('Network down'),
        dataUpdatedAt: 0,
      })
    );

    render(<SessionsSection />);

    expect(screen.getByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders an empty-state message when no sessions are returned', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(queryStateFor({ data: [], dataUpdatedAt: Date.now() }));

    const { container } = render(<SessionsSection />);

    expect(screen.getByText(/no active sessions/i)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sessions-empty"]')).not.toBeNull();
  });

  it('pins the current session at the top with a "This device" badge', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [
          buildSession('s2', { updatedAt: '2024-01-05T00:00:00Z' }),
          buildSession('s1', { updatedAt: '2024-01-01T00:00:00Z' }),
        ],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const rows = container.querySelectorAll('[data-slot="session-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-current', 'true');
    expect(rows[1]).not.toHaveAttribute('data-current');
    expect(screen.getByText('This device')).toBeInTheDocument();
  });

  it('renders all 5 metadata fields (device, IP, signed-in, last-active, expires)', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({ data: [buildSession('s1')], dataUpdatedAt: Date.now() })
    );

    render(<SessionsSection />);

    expect(screen.getByText('Safari on Mac OS')).toBeInTheDocument();
    expect(screen.getByText('IP')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText('Last active')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('falls back to "Unknown device" and em-dash for null userAgent / ipAddress', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1', { userAgent: null, ipAddress: null })],
        dataUpdatedAt: Date.now(),
      })
    );

    render(<SessionsSection />);

    expect(screen.getByText('Unknown device')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders a Revoke button on every session row', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2')],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const buttons = container.querySelectorAll('[data-slot="session-revoke-button"]');
    expect(buttons).toHaveLength(2);
  });

  it('opens a revoke confirmation for a non-current session with the device descriptor', async () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [
          buildSession('s1'),
          buildSession('s2', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/123' }),
        ],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const otherRow = container.querySelector('[data-slot="session-row"]:not([data-current])');
    expect(otherRow).not.toBeNull();
    const otherButton = otherRow?.querySelector('[data-slot="session-revoke-button"]');
    expect(otherButton).not.toBeNull();
    fireEvent.click(otherButton as Element);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke session?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Firefox/i)).toBeInTheDocument();
  });

  it('opens a sign-out confirmation when revoking the current session', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({ data: [buildSession('s1')], dataUpdatedAt: Date.now() })
    );

    const { container } = render(<SessionsSection />);

    const currentRow = container.querySelector('[data-slot="session-row"][data-current]');
    const button = currentRow?.querySelector('[data-slot="session-revoke-button"]');
    fireEvent.click(button as Element);

    expect(screen.getByText('Revoke this device?')).toBeInTheDocument();
    expect(screen.getByText(/sign you out of this device/i)).toBeInTheDocument();
  });

  it('confirms a non-current revoke by calling the mutation with the row token and closing the dialog', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockedUseRevokeSessionMutation.mockReturnValue(mutationStateFor({ mutateAsync }));
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2', { token: 'tok-other' })],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const otherRow = container.querySelector('[data-slot="session-row"]:not([data-current])');
    fireEvent.click(otherRow?.querySelector('[data-slot="session-revoke-button"]') as Element);

    const dialog = await screen.findByRole('dialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(mutateAsync).toHaveBeenCalledWith({ token: 'tok-other' });
    expect(screen.queryByText('Revoke session?')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with an inline error when the revoke mutation fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Server is down'));
    mockedUseRevokeSessionMutation.mockReturnValue(
      mutationStateFor({
        mutateAsync,
        isError: true,
        error: new Error('Server is down'),
      })
    );
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2')],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const otherRow = container.querySelector('[data-slot="session-row"]:not([data-current])');
    fireEvent.click(otherRow?.querySelector('[data-slot="session-revoke-button"]') as Element);

    const dialog = await screen.findByRole('dialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(screen.getByText('Revoke session?')).toBeInTheDocument();
    expect(screen.getByText('Server is down')).toBeInTheDocument();
  });

  it('signs out and redirects to /login when confirming the current-session revoke', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockedUseAuthClient.mockReturnValue({ signOut } as never);
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({ data: [buildSession('s1')], dataUpdatedAt: Date.now() })
    );

    const { container } = render(<SessionsSection />);

    const currentRow = container.querySelector('[data-slot="session-row"][data-current]');
    fireEvent.click(currentRow?.querySelector('[data-slot="session-revoke-button"]') as Element);

    const dialog = await screen.findByRole('dialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(locationStub.href).toBe('/login');
  });

  it('disables the Revoke button and warns when a session row has no token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2', { token: '' })],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const otherRow = container.querySelector('[data-slot="session-row"]:not([data-current])');
    const button = otherRow?.querySelector(
      '[data-slot="session-revoke-button"]'
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/empty token|without a token/i));

    warnSpy.mockRestore();
  });

  it('hides the "Revoke all other sessions" button when only the current session exists', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({ data: [buildSession('s1')], dataUpdatedAt: Date.now() })
    );

    const { container } = render(<SessionsSection />);

    expect(container.querySelector('[data-slot="revoke-others-button"]')).toBeNull();
  });

  it('renders the "Revoke all other sessions" button when more than one session exists', () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2'), buildSession('s3')],
        dataUpdatedAt: Date.now(),
      })
    );

    render(<SessionsSection />);

    expect(screen.getByRole('button', { name: /revoke all other sessions/i })).toBeInTheDocument();
  });

  it('opens a confirmation dialog with the count of other sessions and sign-out warning', async () => {
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2'), buildSession('s3')],
        dataUpdatedAt: Date.now(),
      })
    );

    render(<SessionsSection />);

    fireEvent.click(screen.getByRole('button', { name: /revoke all other sessions/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke all other sessions?')).toBeInTheDocument();
    expect(within(dialog).getByText(/2 other session\(s\)\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/sign all other devices out/i)).toBeInTheDocument();
  });

  it('calls revokeOthersMutation.mutateAsync on confirm and closes the dialog', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockedUseRevokeOtherSessionsMutation.mockReturnValue(
      revokeOthersMutationStateFor({ mutateAsync })
    );
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2')],
        dataUpdatedAt: Date.now(),
      })
    );

    render(<SessionsSection />);

    fireEvent.click(screen.getByRole('button', { name: /revoke all other sessions/i }));
    const dialog = await screen.findByRole('dialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Revoke all other sessions?')).not.toBeInTheDocument();
  });

  it('disables the panic button and shows a spinner while the mutation is pending', () => {
    mockedUseRevokeOtherSessionsMutation.mockReturnValue(
      revokeOthersMutationStateFor({ isPending: true })
    );
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2')],
        dataUpdatedAt: Date.now(),
      })
    );

    const { container } = render(<SessionsSection />);

    const button = container.querySelector(
      '[data-slot="revoke-others-button"]'
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('.animate-spin')).not.toBeNull();
  });

  it('keeps the dialog open with an inline error when the panic mutation fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Server is down'));
    mockedUseRevokeOtherSessionsMutation.mockReturnValue(
      revokeOthersMutationStateFor({
        mutateAsync,
        isError: true,
        error: new Error('Server is down'),
      })
    );
    mockedUseAuthSession.mockReturnValue(authStateFor('s1'));
    mockedUseSessionsQuery.mockReturnValue(
      queryStateFor({
        data: [buildSession('s1'), buildSession('s2')],
        dataUpdatedAt: Date.now(),
      })
    );

    render(<SessionsSection />);

    fireEvent.click(screen.getByRole('button', { name: /revoke all other sessions/i }));
    const dialog = await screen.findByRole('dialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(screen.getByText('Revoke all other sessions?')).toBeInTheDocument();
    expect(screen.getByText('Server is down')).toBeInTheDocument();
  });
});
