import { redirect } from 'next/navigation';
import type { FC } from 'react';
import { buildSkillFileViewHref } from '@/lib/utils/skill-files';
import { resolveSkillFilePageData } from './skills-data';

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({ params }) => {
  const { tenantId, projectId } = await params;
  const { files } = await resolveSkillFilePageData(tenantId, projectId);

  if (!files.length) {
    return null;
  }

  redirect(buildSkillFileViewHref(tenantId, projectId, files[0].skillId, files[0].filePath));
};

export default SkillsPage;
