import type { FC } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { SkillForm } from '@/components/skills/form/skill-form';

const NewSkillPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills/new'>> = async ({
  params,
}) => {
  const { tenantId, projectId } = await params;

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Skills', href: `/${tenantId}/projects/${projectId}/skills` },
        'New Skill',
      ]}
      className="max-w-4xl mx-auto"
    >
      <SkillForm />
    </BodyTemplate>
  );
};

export default NewSkillPage;
