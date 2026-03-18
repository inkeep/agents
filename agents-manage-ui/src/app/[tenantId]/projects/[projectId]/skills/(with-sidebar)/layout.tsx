import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { SkillsSidebar } from '@/components/skills/skills-sidebar';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { fetchSkillsPageData } from '../skills-data';

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
    const { permissions, treeNodes, defaultSelectedRoutePath, fileRouteAliases } =
      await fetchSkillsPageData(tenantId, projectId);

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
        <SidebarProvider className="border border-border/70 rounded-[14px] overflow-hidden min-h-[80vh]">
          <SkillsSidebar
            treeNodes={treeNodes}
            defaultSelectedRoutePath={defaultSelectedRoutePath}
            fileRouteAliases={fileRouteAliases}
            canEdit={permissions.canEdit}
            className="h-auto"
          />
          <SidebarInset className="min-w-0">{children}</SidebarInset>
        </SidebarProvider>
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsLayout;
