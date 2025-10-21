import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

async function NewDataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Components',
          href: `/${tenantId}/projects/${projectId}/components`,
        },
        { label: 'New Component' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <DataComponentForm tenantId={tenantId} projectId={projectId} />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default NewDataComponentPage;
