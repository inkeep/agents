'use client';

import { useParams } from 'next/navigation';
import { type FC, type ReactNode, useEffect } from 'react';
import { sentry } from '@/lib/sentry';

interface SentryScopeProviderProps {
  children: ReactNode;
}

export const SentryScopeProvider: FC<SentryScopeProviderProps> = ({ children }) => {
  const params = useParams<{ tenantId?: string }>();
  const { tenantId } = params;

  useEffect(() => {
    if (tenantId) {
      sentry.setTag('tenantId', tenantId);
    }

    return () => {
      sentry.setTag('tenantId', undefined);
    };
  }, [tenantId]);

  return <>{children}</>;
};
