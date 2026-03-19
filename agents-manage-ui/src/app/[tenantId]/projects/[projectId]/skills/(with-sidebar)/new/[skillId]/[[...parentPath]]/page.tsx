import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { SkillFileEditor } from '@/components/skills/skill-file-editor';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { fetchSkill } from '@/lib/api/skills';
import { getErrorCode } from '@/lib/utils/error-serialization';

const NewSkillFilePage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/new/[skillId]/[[...parentPath]]'>
> = async ({ params }) => {
  const { tenantId, projectId, skillId, parentPath } = await params;

  try {
    const [permissions, skill] = await Promise.all([
      fetchProjectPermissions(tenantId, projectId),
      fetchSkill(tenantId, projectId, skillId),
    ]);

    return (
      <SkillFileEditor
        tenantId={tenantId}
        projectId={projectId}
        skillId={skill.id}
        filePath={parentPath?.join('/') ? `${parentPath.join('/')}/` : ''}
        initialContent=""
        canEdit={permissions.canEdit}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skill file" />;
  }
};

export default NewSkillFilePage;
