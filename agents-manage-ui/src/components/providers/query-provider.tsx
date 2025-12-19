'use client';

import { QueryClient, QueryClientProvider, type QueryClientConfig } from '@tanstack/react-query';
import type { FC, ReactNode } from 'react';
import { useState } from 'react';

const QUERY_CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
};

export const QueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [queryClient] = useState(() => new QueryClient(QUERY_CONFIG));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
