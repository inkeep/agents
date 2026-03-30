// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
import { useCapabilitiesQuery } from '@/lib/query/capabilities';
import { renderWithClient } from './test-utils';

vi.mock('@/lib/actions/capabilities', () => ({
  getCapabilitiesAction: vi.fn(),
}));

const CapabilitiesConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useCapabilitiesQuery();

  if (isFetching || !data) {
    return;
  }

  return <div data-testid={`capabilities-${label}`}>{String(data.sandbox.configured)}</div>;
};

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
