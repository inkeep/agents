import FullPageError from '@/components/errors/full-page-error';
import { ProjectProvider } from '@/contexts/project';
import { fetchProject } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<'/[tenantId]/projects/[projectId]'>) {
  const { tenantId, projectId } = await params;

  try {
    // Verify project exists
    const { data } = await fetchProject(tenantId, projectId);
    return <ProjectProvider value={data}>{children}</ProjectProvider>;
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        context="project"
        link={`/${tenantId}/projects`}
        linkText="Back to projects"
      />
    );
  }
}
