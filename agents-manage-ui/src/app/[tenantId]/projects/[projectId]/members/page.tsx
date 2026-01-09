import { ShareProjectWrapper } from '@/components/access/share-project-wrapper';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchProject } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/members'>) {
  const { tenantId, projectId } = await params;

  try {
    const projectData = await fetchProject(tenantId, projectId);

    // Permission to manage access is enforced by the API (requires 'edit' permission).
    // If user lacks permission, API calls will fail gracefully.
    const canManageAccess = true;

    return (
      <BodyTemplate breadcrumbs={['Members']} className="max-w-xl mx-auto">
        <ShareProjectWrapper
          projectId={projectId}
          projectName={projectData.data.name}
          tenantId={tenantId}
          canManage={canManageAccess}
        />
      </BodyTemplate>
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
