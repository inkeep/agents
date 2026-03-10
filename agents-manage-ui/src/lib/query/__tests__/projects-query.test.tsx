// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { fetchProjects } from '@/lib/api/projects';
import { useProjectsQuery } from '@/lib/query/projects';
import { renderWithClient } from './test-utils';

vi.mock('@/lib/api/projects', () => ({
  fetchProjects: vi.fn(),
}));

const project = {
  id: 1,
};

const ProjectsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useProjectsQuery({ tenantId: 'tenant-1' });

  if (isFetching) {
    return;
  }

  return <div data-testid={`projects-${label}`}>{data[0].id}</div>;
};

describe('useProjectsQuery', () => {
  it('dedupes project requests for the same tenant', async () => {
    const fetchProjectsActionMock = vi.mocked(fetchProjects);
    fetchProjectsActionMock.mockResolvedValue({ data: [project] } as any);

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
