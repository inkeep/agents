import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import FullPageError from '@/components/errors/full-page-error';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { projectQueryKeys } from '@/lib/query/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<'/[tenantId]/projects/[projectId]'>) {
  const { tenantId, projectId } = await params;

  try {
    const queryClient = new QueryClient();
    const permissions = await fetchProjectPermissions(tenantId, projectId);
    queryClient.setQueryData(projectQueryKeys.permissions(tenantId, projectId), permissions);

    // Hydrates React Query before any child client component renders.
    // That makes useProjectPermissionsQuery() in projects.ts start with real data
    return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
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
