import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ProjectForm } from '@/components/projects/form/project-form';
import type { ProjectFormData } from '@/components/projects/form/validation';
import { fetchProject } from '@/lib/api/projects';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/settings'>) {
  const { tenantId, projectId } = await params;

  let projectData: Awaited<ReturnType<typeof fetchProject>>;
  try {
    projectData = await fetchProject(tenantId, projectId);
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects`}
        linkText="Back to projects"
        context="project"
      />
    );
  }
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Settings' }]}>
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
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
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
