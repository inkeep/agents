// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
import { useCapabilitiesQuery } from '@/lib/query/capabilities';

vi.mock('@/lib/actions/capabilities', () => ({
  getCapabilitiesAction: vi.fn(),
}));

const CapabilitiesConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useCapabilitiesQuery();

  if (isFetching) {
    return;
  }

  return <div data-testid={`capabilities-${label}`}>{String(data.sandbox.configured)}</div>;
};

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  });

  const view = render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);

  return { ...view, queryClient };
}

describe('useCapabilitiesQuery', () => {
  it('dedupes capability requests', async () => {
    const getCapabilitiesActionMock = vi.mocked(getCapabilitiesAction);
    getCapabilitiesActionMock.mockResolvedValue({
      success: true,
      data: {
        sandbox: {
          configured: true,
        },
      },
    });

    const { queryClient } = renderWithClient(
      <>
        <CapabilitiesConsumer label="one" />
        <CapabilitiesConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('capabilities-one').textContent).toBe('true');
      expect(screen.getByTestId('capabilities-two').textContent).toBe('true');
    });

    expect(getCapabilitiesActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
