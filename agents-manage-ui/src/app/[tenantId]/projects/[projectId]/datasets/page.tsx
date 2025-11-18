import { DatasetsList } from '@/components/datasets/datasets-list';
import FullPageError from '@/components/errors/full-page-error';
import { Database } from '@/components/icons/empty-state/database';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchDatasets } from '@/lib/api/datasets';

export const dynamic = 'force-dynamic';

const datasetDescription =
  'Test suites are collections of test cases used for evaluating agent performance.';

async function DatasetsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/datasets'>) {
  const { tenantId, projectId } = await params;
  try {
    const datasets = await fetchDatasets(tenantId, projectId);
    return (
      <BodyTemplate
        breadcrumbs={[
          { label: 'Test Suites', href: `/${tenantId}/projects/${projectId}/datasets` },
        ]}
      >
        <MainContent className="min-h-full">
          {datasets.data.length > 0 ? (
            <>
              <PageHeader title="Test Suites" description={datasetDescription} />
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
          )}
        </MainContent>
      </BodyTemplate>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="datasets" />;
  }
}

export default DatasetsPage;
