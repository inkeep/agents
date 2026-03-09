// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    tenantId: 'tenant-1',
    projectId: 'project-1',
  }),
}));

vi.mock('@/lib/actions/artifact-components', () => ({
  fetchArtifactComponentsAction: vi.fn(),
}));

const ArtifactComponentsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useArtifactComponentsQuery();

  if (isFetching) {
    return;
  }

  return <div data-testid={`artifact-components-${label}`}>{data[0].id}</div>;
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

describe('useArtifactComponentsQuery', () => {
  it('dedupes artifact component requests for the same project', async () => {
    const fetchArtifactComponentsActionMock = vi.mocked(fetchArtifactComponentsAction);
    fetchArtifactComponentsActionMock.mockResolvedValue({
      success: true,
      data: [{ id: 1 } as any],
    });

    const { queryClient } = renderWithClient(
      <>
        <ArtifactComponentsConsumer label="one" />
        <ArtifactComponentsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-components-one').textContent).toBe('1');
      expect(screen.getByTestId('artifact-components-two').textContent).toBe('1');
    });

    expect(fetchArtifactComponentsActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
