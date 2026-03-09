import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  });
}

export function renderWithClient(children: ReactNode) {
  const queryClient = createTestQueryClient();
  const view = render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);

  return { ...view, queryClient };
}
