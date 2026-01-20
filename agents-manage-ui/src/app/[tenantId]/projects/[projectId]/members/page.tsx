import { ProjectMembersWrapper } from '@/components/access/project-members-wrapper';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/members'>) {
  const { tenantId, projectId } = await params;

  try {
    const permissions = await fetchProjectPermissions(tenantId, projectId);

    return (
      <BodyTemplate breadcrumbs={['Members']} className="max-w-xl mx-auto">
        <ProjectMembersWrapper
          projectId={projectId}
          tenantId={tenantId}
          canManage={permissions.canEdit}
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
