// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { fetchProjectsAction } from '@/lib/actions/projects';
import { useProjectsQuery } from '@/lib/query/projects';
import type { Project } from '@/lib/types/project';

vi.mock('@/lib/actions/projects', () => ({
  fetchProjectsAction: vi.fn(),
}));

const project: Project = {
  id: 'project-1',
  projectId: 'project-1',
  tenantId: 'tenant-1',
  name: 'Project 1',
  description: 'desc',
  models: {
    base: {
      model: 'base-model',
    },
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const ProjectsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isPending } = useProjectsQuery({ tenantId: 'tenant-1' });

  if (isPending) {
    return <div data-testid={`loading-${label}`}>Loading</div>;
  }

  return <div data-testid={`projects-${label}`}>{data?.length ?? 0}</div>;
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

describe('useProjectsQuery', () => {
  it('dedupes project requests for the same tenant', async () => {
    const fetchProjectsActionMock = vi.mocked(fetchProjectsAction);
    fetchProjectsActionMock.mockResolvedValue({
      success: true,
      data: [project],
    });

    const { queryClient } = renderWithClient(
      <>
        <ProjectsConsumer label="one" />
        <ProjectsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('projects-one').textContent).toBe('1');
      expect(screen.getByTestId('projects-two').textContent).toBe('1');
    });

    expect(fetchProjectsActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
