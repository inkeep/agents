// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { FC } from 'react';
import { fetchSkills } from '@/lib/api/skills';
import { useSkillsQuery } from '@/lib/query/skills';
import { renderWithClient } from './test-utils';

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
