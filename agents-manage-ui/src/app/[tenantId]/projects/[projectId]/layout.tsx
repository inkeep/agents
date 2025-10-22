import FullPageError from '@/components/errors/full-page-error';
import { fetchProject } from '@/lib/api/projects';
import { ProjectProvider } from '@/contexts/project-context';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<'/[tenantId]/projects/[projectId]'>) {
  const { tenantId, projectId } = await params;

  try {
    // Verify project exists
    const project = await fetchProject(tenantId, projectId);
    return <ProjectProvider value={project.data}>{children}</ProjectProvider>;
  } catch (error) {
    return <FullPageError error={error as Error} context="project" />;
  }
}
