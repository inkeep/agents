import type { FC } from 'react';
import { SkillFileEditor } from '@/components/skills/skill-file-editor';

const NewSkillFilePage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/new/[skillId]/[[...parentPath]]'>
> = async ({ params }) => {
  const { tenantId, projectId, skillId, parentPath } = await params;

  return (
    <SkillFileEditor
      tenantId={tenantId}
      projectId={projectId}
      skillId={skillId}
      filePath=""
      initialDirectoryPath={parentPath?.join('/')}
      initialContent=""
    />
  );
};

export default NewSkillFilePage;
