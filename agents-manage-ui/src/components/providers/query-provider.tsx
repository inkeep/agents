'use client';

import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryClientConfig,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

const QUERY_CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError(error, query) {
      const errorMessage = error.message || (query.meta?.defaultError as string | undefined);
      if (errorMessage) {
        toast.error(errorMessage);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError(error, _, _2, mutation) {
      const errorMessage = error.message || (mutation.meta?.defaultError as string | undefined);
      if (errorMessage) {
        toast.error(errorMessage);
      }
    },
  }),
};

export const QueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [queryClient] = useState(() => new QueryClient(QUERY_CONFIG));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
