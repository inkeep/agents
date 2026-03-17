import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { SkillsSidebar } from '@/components/skills/skills-sidebar';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { fetchSkillsPageData } from './skills-data';

export const metadata = {
  title: STATIC_LABELS.skills,
  description:
    'Agent Skills are reusable instruction blocks that can be attached to multiple sub-agents and ordered for priority.',
} satisfies Metadata;

const description = (
  <>
    {metadata.description}
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/skills`}>Learn more</ExternalLink>
  </>
);

const SkillsLayout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({
  children,
  params,
}) => {
  const { tenantId, projectId } = await params;

  try {
    const { permissions, treeNodes, defaultSelectedPath } = await fetchSkillsPageData(
      tenantId,
      projectId
    );

    const action = permissions.canEdit && (
      <Button asChild className="flex items-center gap-2">
        <NextLink href={`/${tenantId}/projects/${projectId}/skills/new`}>
          <Plus />
          Create skill
        </NextLink>
      </Button>
    );

    return (
      <>
        <PageHeader title={metadata.title} description={description} action={action} />
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
              <SkillsSidebar treeNodes={treeNodes} defaultSelectedPath={defaultSelectedPath} />
            </aside>
            <section className="min-w-0 overflow-auto p-6">{children}</section>
          </div>
        </div>
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsLayout;
