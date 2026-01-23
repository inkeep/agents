'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillApiInsert, SkillApiUpdate } from '@inkeep/agents-core';
import type { Skill } from '@/lib/types/skills';
import { createSkill, updateSkill } from '@/lib/api/skills';
import { useParams } from 'next/navigation';

const skillQueryKeys = {
  list: (tenantId: string, projectId: string) => ['skills', tenantId, projectId] as const,
  single: (tenantId: string, projectId: string, skillId: string) =>
    ['skill', tenantId, projectId, skillId] as const,
};

type UpsertSkillInput = {
  skillId?: string;
  data: SkillApiInsert;
};

export function useUpsertSkillMutation() {
  'use memo';
  const queryClient = useQueryClient();
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useMutation<Skill, Error, UpsertSkillInput>({
    async mutationFn({ skillId, data }) {
      const result = skillId
        ? await updateSkill(tenantId, projectId, skillId, omitNameForUpdate(data))
        : await createSkill(tenantId, projectId, data);

      return result;
    },
    async onSuccess(skill) {
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.list(tenantId, projectId) });
      await queryClient.invalidateQueries({
        queryKey: skillQueryKeys.single(tenantId, projectId, skill.id),
      });
    },
  });
}

function omitNameForUpdate(data: SkillApiInsert): SkillApiUpdate {
  const { name: _name, ...updateData } = data;
  return updateData;
}
