// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';
import { renderWithClient } from './test-utils';

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
