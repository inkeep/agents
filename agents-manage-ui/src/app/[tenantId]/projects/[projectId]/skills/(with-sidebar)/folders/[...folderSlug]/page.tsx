import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { SkillDirectoryBrowser } from '@/components/skills/skill-file-editor';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { resolveSkillFolderPageData } from '../../../skills-data';

const SkillFolderPage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/folders/[...folderSlug]'>
> = async ({ params }) => {
  const { tenantId, projectId, folderSlug } = await params;

  try {
    const { selectedFolder } = await resolveSkillFolderPageData(tenantId, projectId, folderSlug);

    if (!selectedFolder || selectedFolder.kind !== 'folder') {
      return <FullPageError errorCode="not_found" context="skill folder" />;
    }

    return (
      <SkillDirectoryBrowser
        tenantId={tenantId}
        projectId={projectId}
        directoryNode={selectedFolder}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skill folder" />;
  }
};

export default SkillFolderPage;
