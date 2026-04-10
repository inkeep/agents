import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';

const NewSkillPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills/new'>> = async ({
  params,
}) => {
  const { tenantId, projectId } = await params;
  const fallback = `/${tenantId}/projects/${projectId}/skills`;
  await checkProjectPermissionOrRedirect(tenantId, projectId, 'edit', fallback);

  return <SkillForm />;
};

export default NewSkillPage;
