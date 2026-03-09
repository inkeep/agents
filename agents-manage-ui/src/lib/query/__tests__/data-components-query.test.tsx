// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    tenantId: 'tenant-1',
    projectId: 'project-1',
  }),
}));

vi.mock('@/lib/actions/data-components', () => ({
  fetchDataComponentsAction: vi.fn(),
}));

const dataComponent = {
  id: 1,
};

const DataComponentsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useDataComponentsQuery();
  if (isFetching) {
    return;
  }
  return <div data-testid={`data-components-${label}`}>{data[0].id}</div>;
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

describe('useDataComponentsQuery', () => {
  it('dedupes data component requests for the same project', async () => {
    const fetchDataComponentsActionMock = vi.mocked(fetchDataComponentsAction);
    fetchDataComponentsActionMock.mockResolvedValue({
      success: true,
      data: [dataComponent as any],
    });

    const { queryClient } = renderWithClient(
      <>
        <DataComponentsConsumer label="one" />
        <DataComponentsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-components-one').textContent).toBe('1');
      expect(screen.getByTestId('data-components-two').textContent).toBe('1');
    });

    expect(fetchDataComponentsActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
