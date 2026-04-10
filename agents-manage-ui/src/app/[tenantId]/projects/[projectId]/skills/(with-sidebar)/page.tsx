import { Plus } from 'lucide-react';
import NextLink from 'next/link';
import { redirect } from 'next/navigation';
import type { FC } from 'react';
import EmptyState from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { buildSkillFileViewHref } from '@/lib/utils/skill-files';
import { resolveSkillFilePageData } from '../skills-data';
import { metadata } from './layout';

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({ params }) => {
  const { tenantId, projectId } = await params;
  const [{ files }, permissions] = await Promise.all([
    resolveSkillFilePageData(tenantId, projectId),
    fetchProjectPermissions(tenantId, projectId),
  ]);

  const action = permissions.canEdit && (
    <Button asChild className="flex items-center gap-2">
      <NextLink href={`/${tenantId}/projects/${projectId}/skills/new`}>
        <Plus />
        Create skill
      </NextLink>
    </Button>
  );

  if (!files.length) {
    return <EmptyState title="No skills yet." description={metadata.description} action={action} />;
  }

  redirect(buildSkillFileViewHref(tenantId, projectId, files[0].skillId, files[0].filePath));
};

export default SkillsPage;
