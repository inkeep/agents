// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { fetchMCPTools } from '@/lib/api/tools';
import { useMcpToolsQuery } from '@/lib/query/mcp-tools';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    tenantId: 'tenant-1',
    projectId: 'project-1',
  }),
}));

vi.mock('@/lib/api/tools', () => ({
  fetchMCPTools: vi.fn(),
}));

const tool = {
  id: 1,
};

const ToolsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useMcpToolsQuery({ skipDiscovery: true });

  if (isFetching) {
    return;
  }

  return <div data-testid={`tools-${label}`}>{data[0].id}</div>;
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

describe('useMcpToolsQuery', () => {
  it('dedupes MCP tool requests for the same project and options', async () => {
    const fetchMCPToolsMock = vi.mocked(fetchMCPTools);
    fetchMCPToolsMock.mockResolvedValue([tool as any]);

    const { queryClient } = renderWithClient(
      <>
        <ToolsConsumer label="one" />
        <ToolsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-one').textContent).toBe('1');
      expect(screen.getByTestId('tools-two').textContent).toBe('1');
    });

    expect(fetchMCPToolsMock).toHaveBeenCalledTimes(1);
    expect(fetchMCPToolsMock).toHaveBeenCalledWith('tenant-1', 'project-1', {
      skipDiscovery: true,
    });
    queryClient.clear();
  });
});
