import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

interface NewDataComponentPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function NewDataComponentPage({ params }: NewDataComponentPageProps) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Data components',
          href: `/${tenantId}/projects/${projectId}/data-components`,
        },
        { label: 'New Data Component' },
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
