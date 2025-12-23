import { DatasetRunDetails } from '@/components/datasets/dataset-run-details';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

export const dynamic = 'force-dynamic';

export default async function DatasetRunPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/[datasetId]/runs/[runId]'>) {
  const { tenantId, projectId, datasetId, runId } = await params;

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Test Suites',
          href: `/${tenantId}/projects/${projectId}/datasets`,
        },
        {
          label: 'Test Suite',
          href: `/${tenantId}/projects/${projectId}/datasets/${datasetId}`,
        },
        { label: 'Run' },
      ]}
    >
      <MainContent>
        <DatasetRunDetails
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          runId={runId}
        />
      </MainContent>
    </BodyTemplate>
  );
}
