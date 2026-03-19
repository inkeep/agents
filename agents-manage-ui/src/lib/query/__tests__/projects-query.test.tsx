// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { fetchProject, fetchProjectPermissions, fetchProjects } from '@/lib/api/projects';
import {
  useProjectPermissionsQuery,
  useProjectQuery,
  useProjectsQuery,
} from '@/lib/query/projects';
import { renderWithClient } from './test-utils';

vi.mock('@/lib/api/projects', () => ({
  fetchProject: vi.fn(),
  fetchProjectPermissions: vi.fn(),
  fetchProjects: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useParams() {
    return { tenantId: 'tenant-1', projectId: 'project-1' };
  },
}));

const project = {
  projectId: 'project-1',
};
const permissions = {
  canView: true,
  canUse: true,
  canEdit: true,
};

const ProjectsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useProjectsQuery({ tenantId: 'tenant-1' });

  if (isFetching) {
    return;
  }

  return <div data-testid={`projects-${label}`}>{data[0].projectId}</div>;
};

const ProjectConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useProjectQuery();

  if (isFetching || !data) {
    return;
  }

  return <div data-testid={`project-${label}`}>{data.projectId}</div>;
};

const ProjectPermissionsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useProjectPermissionsQuery();

  if (isFetching) {
    return;
  }

  return <div data-testid={`project-permissions-${label}`}>{String(data.canEdit)}</div>;
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
      expect(screen.getByTestId('projects-one').textContent).toBe('project-1');
      expect(screen.getByTestId('projects-two').textContent).toBe('project-1');
    });

    expect(fetchProjectsActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it('dedupes project detail requests for the same route', async () => {
    const fetchProjectActionMock = vi.mocked(fetchProject);
    fetchProjectActionMock.mockResolvedValue({ data: project } as any);

    const { queryClient } = renderWithClient(
      <>
        <ProjectConsumer label="one" />
        <ProjectConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-one').textContent).toBe('project-1');
      expect(screen.getByTestId('project-two').textContent).toBe('project-1');
    });

    expect(fetchProjectActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it('dedupes project permission requests for the same route', async () => {
    const fetchProjectPermissionsActionMock = vi.mocked(fetchProjectPermissions);
    fetchProjectPermissionsActionMock.mockResolvedValue(permissions);

    const { queryClient } = renderWithClient(
      <>
        <ProjectPermissionsConsumer label="one" />
        <ProjectPermissionsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-permissions-one').textContent).toBe('true');
      expect(screen.getByTestId('project-permissions-two').textContent).toBe('true');
    });

    expect(fetchProjectPermissionsActionMock).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
