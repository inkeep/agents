import { redirect } from 'next/navigation';
import type { FC } from 'react';
import EmptyState from '@/components/layout/empty-state';
import { buildSkillFileViewHref } from '@/lib/utils/skill-files';
import { resolveSkillFilePageData } from '../skills-data';
import { metadata } from './layout';

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({ params }) => {
  const { tenantId, projectId } = await params;
  const { files } = await resolveSkillFilePageData(tenantId, projectId);

  if (!files.length) {
    return <EmptyState title="No skills yet." description={metadata.description} />;
  }

  redirect(buildSkillFileViewHref(tenantId, projectId, files[0].skillId, files[0].filePath));
};

export default SkillsPage;
