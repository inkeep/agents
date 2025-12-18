import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { ProjectForm } from '@/components/projects/form/project-form';
import type { ProjectFormData } from '@/components/projects/form/validation';
import { fetchProject } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/settings'>) {
  const { tenantId, projectId } = await params;

  try {
    const projectData = await fetchProject(tenantId, projectId);
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
