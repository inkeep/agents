import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { ProjectForm } from '@/components/projects/form/project-form';
import type { ProjectFormData } from '@/components/projects/form/validation';
import { fetchProject, fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/settings'>) {
  const { tenantId, projectId } = await params;

  try {
    const [projectData, permissions] = await Promise.all([
      fetchProject(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);

    return (
      <BodyTemplate breadcrumbs={['Settings']} className="max-w-2xl mx-auto">
        <ProjectForm
          projectId={projectData.data.id}
          initialData={
            {
              ...projectData.data,
              id: projectData.data.id as string,
            } as ProjectFormData
          }
          tenantId={tenantId}
          readOnly={!permissions.canEdit}
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
