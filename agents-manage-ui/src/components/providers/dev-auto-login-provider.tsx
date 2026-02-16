'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';

export function DevAutoLoginProvider({ children }: { children: React.ReactNode }) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { isAuthenticated, isLoading } = useAuthSession();
  const attemptedRef = useRef(false);

  // In production, children render immediately (no gate).
  // In dev, children are gated until auto-login resolves.
  // This prevents child useEffects (e.g. page.tsx redirect to /login)
  // from firing before the auto-login fetch completes.
  const [ready, setReady] = useState(process.env.NODE_ENV !== 'development');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Skip auto-login under Cypress — it manages its own login flow via cy.login()
    if ('Cypress' in window) {
      setReady(true);
      return;
    }

    // Already authenticated — no auto-login needed
    if (isAuthenticated) {
      setReady(true);
      return;
    }

    // Still checking session — wait
    if (isLoading) return;

    // Only attempt once per mount
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    fetch(`${PUBLIC_INKEEP_AGENTS_API_URL}/api/auth/dev-session`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          // Cookie is now set. Reload to let useSession() pick it up.
          window.location.reload();
        } else {
          // Auto-login failed (init not run, or credentials wrong).
          // Fall through to normal login page.
          console.warn(
            `[DevAutoLogin] Auto-login failed (HTTP ${res.status}). Run \`pnpm db:auth:init\` to set up dev credentials.`
          );
          setReady(true);
        }
      })
      .catch((err) => {
        // Network error (API not running, CORS, port mismatch). Fall through to login.
        console.warn('[DevAutoLogin] Fetch failed:', err);
        setReady(true);
      });
  }, [isLoading, isAuthenticated, PUBLIC_INKEEP_AGENTS_API_URL]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
