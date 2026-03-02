import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';

const NewSkillPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills/new'>> = async ({
  params,
}) => {
  const { tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/skills`
  );

  return <SkillForm />;
};

export default NewSkillPage;
