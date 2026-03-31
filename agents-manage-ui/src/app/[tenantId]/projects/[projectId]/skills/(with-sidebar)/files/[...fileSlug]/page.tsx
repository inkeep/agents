import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { SkillFileEditor } from '@/components/skills/skill-file-editor';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { resolveSkillFilePageData } from '../../../skills-data';

const SkillFilePage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/files/[...fileSlug]'>
> = async ({ params }) => {
  const { tenantId, projectId, fileSlug } = await params;

  try {
    const { selectedFile } = await resolveSkillFilePageData(tenantId, projectId, fileSlug);

    if (!selectedFile) {
      return <FullPageError errorCode="not_found" context="skill file" />;
    }

    return (
      <SkillFileEditor
        tenantId={tenantId}
        projectId={projectId}
        skillId={selectedFile.skillId}
        fileId={selectedFile.fileId}
        filePath={selectedFile.filePath}
        initialContent={selectedFile.content}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skill file" />;
  }
};

export default SkillFilePage;
