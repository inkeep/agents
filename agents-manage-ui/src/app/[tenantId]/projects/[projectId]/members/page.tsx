import { ProjectMembersWrapper } from '@/components/access/project-members-wrapper';
import FullPageError from '@/components/errors/full-page-error';
import { fetchProject } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/members'>) {
  const { tenantId, projectId } = await params;

  try {
    // Verify project exists and user has access
    await fetchProject(tenantId, projectId);

    // Permission to manage access is enforced by the API (requires 'edit' permission).
    // If user lacks permission, API calls will fail gracefully.
    const canManageAccess = false;

    return (
      <ProjectMembersWrapper
        projectId={projectId}
        tenantId={tenantId}
        canManage={canManageAccess}
      />
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects`}
        linkText="Back to projects"
        context="project"
      />
    );
  }
}
