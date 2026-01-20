import { DatasetsList } from '@/components/datasets/datasets-list';
import FullPageError from '@/components/errors/full-page-error';
import { Database } from '@/components/icons/empty-state/database';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchDatasets } from '@/lib/api/datasets';

export const dynamic = 'force-dynamic';

const datasetDescription =
  'Test suites are collections of test cases used for evaluating agent performance.';

async function DatasetsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/datasets'>) {
  const { tenantId, projectId } = await params;
  try {
    const datasets = await fetchDatasets(tenantId, projectId);
    return datasets.data.length ? (
      <>
        <PageHeader title={STATIC_LABELS.datasets} description={datasetDescription} />
        <DatasetsList tenantId={tenantId} projectId={projectId} datasets={datasets.data} />
      </>
    ) : (
      <EmptyState
        title="No test suites yet."
        description={datasetDescription}
        link={`/${tenantId}/projects/${projectId}/datasets/new`}
        linkText="Create test suite"
        icon={<Database />}
      />
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="datasets" />;
  }
}

export default DatasetsPage;
