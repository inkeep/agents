import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { SkillFileEditor } from '@/components/skills/skill-file-editor';
import { fetchSkill } from '@/lib/api/skills';
import { getErrorCode } from '@/lib/utils/error-serialization';

const NewSkillFilePage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/new/[skillId]/[[...parentPath]]'>
> = async ({ params }) => {
  const { tenantId, projectId, skillId, parentPath } = await params;

  try {
    const skill = await fetchSkill(tenantId, projectId, skillId);

    return (
      <SkillFileEditor
        tenantId={tenantId}
        projectId={projectId}
        skillId={skill.id}
        filePath=""
        initialDirectoryPath={parentPath?.join('/')}
        initialContent=""
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skill file" />;
  }
};

export default NewSkillFilePage;
