import FullPageError from '@/components/errors/full-page-error';
import { fetchProject } from '@/lib/api/projects';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<'/[tenantId]/projects/[projectId]'>) {
  const { tenantId, projectId } = await params;

  try {
    // Verify project exists
    await fetchProject(tenantId, projectId);
  } catch (_error) {
    return <FullPageError error={_error as Error} context="project" />;
  }

  return <>{children}</>;
}
