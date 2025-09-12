import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ProjectForm } from '@/components/projects/form/project-form';
import type { ProjectFormData } from '@/components/projects/form/validation';
import { fetchProject } from '@/lib/api/projects';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
  params: Promise<{
    tenantId: string;
    projectId: string;
  }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { tenantId, projectId } = await params;
  const projectData = await fetchProject(tenantId, projectId);
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Project Settings',
        },
      ]}
    >
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
