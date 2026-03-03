import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';
import { fetchProjectPermissions } from '@/lib/api/projects';

const EditSkillsPage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/[skillId]/edit'>
> = async ({ params }) => {
  const { tenantId, projectId } = await params;
  const permissions = await fetchProjectPermissions(tenantId, projectId);
  return <SkillForm readOnly={!permissions.canEdit} />;
};

export default EditSkillsPage;
