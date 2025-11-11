import { Database } from 'lucide-react';
import FullPageError from '@/components/errors/full-page-error';
import { DatasetsList } from '@/components/evaluations/datasets-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchDatasets } from '@/lib/api/evaluations-client';

export const dynamic = 'force-dynamic';

async function DatasetsPage({ params }: PageProps<'/[tenantId]/evaluations/datasets'>) {
  const { tenantId } = await params;

  let datasets: Awaited<ReturnType<typeof fetchDatasets>>;
  try {
    datasets = await fetchDatasets(tenantId);
  } catch (error) {
    return <FullPageError error={error as Error} context="datasets" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Evaluations', href: `/${tenantId}/evaluations` },
        { label: 'Datasets', href: `/${tenantId}/evaluations/datasets` },
      ]}
    >
      <MainContent className="min-h-full">
        {datasets.data.length > 0 ? (
          <>
            <PageHeader
              title="Datasets"
              description="Test datasets contain input/output examples for evaluating agent performance"
            />
            <DatasetsList tenantId={tenantId} datasets={datasets.data} />
          </>
        ) : (
          <EmptyState
            title="No datasets yet"
            description="Create datasets with test cases to evaluate your agents"
            link={`/${tenantId}/evaluations/datasets/new`}
            linkText="Create dataset"
            icon={<Database className="h-12 w-12" />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default DatasetsPage;

