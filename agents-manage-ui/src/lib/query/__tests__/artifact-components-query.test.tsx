// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { fetchArtifactComponents } from '@/lib/api/artifact-components';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';
import { renderWithClient } from './test-utils';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    tenantId: 'tenant-1',
    projectId: 'project-1',
  }),
}));

vi.mock('@/lib/api/artifact-components', () => ({
  fetchArtifactComponents: vi.fn(),
}));

const artifactComponent = {
  id: 1,
};

const ArtifactComponentsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useArtifactComponentsQuery();

  if (isFetching) {
    return;
  }

  return <div data-testid={`artifact-components-${label}`}>{data[0].id}</div>;
};

describe('useArtifactComponentsQuery', () => {
  it('dedupes artifact component requests for the same project', async () => {
    const fetchArtifactComponentsActionMock = vi.mocked(fetchArtifactComponents);
    fetchArtifactComponentsActionMock.mockResolvedValue({ data: [artifactComponent] } as any);

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
