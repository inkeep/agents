'use client';

import type { ReactNode } from 'react';
import { AuthClientProvider } from '@/lib/auth-client';

export function ClientProviders({ children }: { children: ReactNode }) {
  return <AuthClientProvider>{children}</AuthClientProvider>;
}
