'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillApiInsert, SkillApiUpdate } from '@inkeep/agents-core';
import { createSkillAction, updateSkillAction } from '@/lib/actions/skills';
import type { Skill } from '@/lib/types/skills';

const skillQueryKeys = {
  list: (tenantId: string, projectId: string) => ['skills', tenantId, projectId] as const,
  single: (tenantId: string, projectId: string, skillId: string) =>
    ['skill', tenantId, projectId, skillId] as const,
};

type UpsertSkillInput = {
  tenantId: string;
  projectId: string;
  skillId?: string;
  data: SkillApiInsert;
};

export function useUpsertSkillMutation() {
  'use memo';
  const queryClient = useQueryClient();

  return useMutation<Skill, Error, UpsertSkillInput>({
    async mutationFn({ tenantId, projectId, skillId, data }) {
      const result = skillId
        ? await updateSkillAction(
            tenantId,
            projectId,
            skillId,
            omitNameForUpdate(data)
          )
        : await createSkillAction(tenantId, projectId, data);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save skill');
      }

      return result.data;
    },
    async onSuccess(skill, { tenantId, projectId, skillId }) {
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.list(tenantId, projectId) });

      const resolvedSkillId = skillId || skill?.id || skill?.name;
      if (resolvedSkillId) {
        await queryClient.invalidateQueries({
          queryKey: skillQueryKeys.single(tenantId, projectId, resolvedSkillId),
        });
      }
    },
  });
}

function omitNameForUpdate(data: SkillApiInsert): SkillApiUpdate {
  const { name: _name, ...updateData } = data;
  return updateData;
}
