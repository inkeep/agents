'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { parseMetadataField, type SkillFormData } from '@/components/skills/form/validation';
import { createSkill, updateSkill } from '@/lib/api/skills';
import type { Skill } from '@/lib/types/skills';

const skillQueryKeys = {
  list: (tenantId: string, projectId: string) => ['skills', tenantId, projectId] as const,
  single: (tenantId: string, projectId: string, skillId: string) =>
    ['skill', tenantId, projectId, skillId] as const,
};

interface UpsertSkillInput {
  skillId?: string;
  data: SkillFormData;
}

export function useUpsertSkillMutation() {
  'use memo';
  const queryClient = useQueryClient();
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useMutation<Skill, Error, UpsertSkillInput>({
    async mutationFn({ skillId, data }) {
      const payload = {
        ...data,
        metadata: parseMetadataField(data.metadata),
      };

      const result = skillId
        ? await updateSkill(tenantId, projectId, skillId, payload)
        : await createSkill(tenantId, projectId, payload);

      return result;
    },
    async onSuccess(skill, { skillId }) {
      toast.success(skillId ? 'Skill updated successfully' : 'Skill created successfully');
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.list(tenantId, projectId) });
      await queryClient.invalidateQueries({
        queryKey: skillQueryKeys.single(tenantId, projectId, skill.id),
      });
    },
    meta: {
      defaultError: 'Failed to save skill',
    },
  });
}
