// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { fetchSkills } from '@/lib/api/skills';
import { useSkillsQuery } from '@/lib/query/skills';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    tenantId: 'tenant-1',
    projectId: 'project-1',
  }),
}));

vi.mock('@/lib/api/skills', () => ({
  fetchSkills: vi.fn(),
}));

const skill = {
  id: 'skill-1',
};

const SkillsConsumer: FC<{ label: string }> = ({ label }) => {
  const { data, isFetching } = useSkillsQuery();

  if (isFetching) {
    return;
  }

  return <div data-testid={`skills-${label}`}>{data[0].id}</div>;
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

describe('useSkillsQuery', () => {
  it('dedupes skill requests for the same project', async () => {
    const fetchSkillsMock = vi.mocked(fetchSkills);
    fetchSkillsMock.mockResolvedValue({
      data: [skill],
    } as any);

    const { queryClient } = renderWithClient(
      <>
        <SkillsConsumer label="one" />
        <SkillsConsumer label="two" />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('skills-one').textContent).toBe('skill-1');
      expect(screen.getByTestId('skills-two').textContent).toBe('skill-1');
    });

    expect(fetchSkillsMock).toHaveBeenCalledTimes(1);
    expect(fetchSkillsMock).toHaveBeenCalledWith('tenant-1', 'project-1');
    queryClient.clear();
  });
});
