import { DatasetForm } from '@/components/datasets/form/dataset-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

async function NewDatasetPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Test Suites',
          href: `/${tenantId}/projects/${projectId}/datasets`,
        },
        { label: 'New Test Suite' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <DatasetForm tenantId={tenantId} projectId={projectId} />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default NewDatasetPage;
