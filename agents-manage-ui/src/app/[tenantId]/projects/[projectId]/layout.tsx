import FullPageError from '@/components/errors/full-page-error';
import { ProjectProvider } from '@/contexts/project-context';
import { fetchProject } from '@/lib/api/projects';

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
    const apiError = error as any;
    const serializedError = new Error(apiError.message || 'An error occurred') as Error & {
      cause?: { status: number; message: string };
    };
    if (apiError.status) {
      serializedError.cause = {
        status: apiError.status,
        message: apiError.error?.message || apiError.message,
      };
    }
    return <FullPageError error={serializedError} context="project" />;
  }
}
