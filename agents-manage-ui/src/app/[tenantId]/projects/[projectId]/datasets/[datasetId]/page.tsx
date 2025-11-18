import { DatasetPageClient } from '@/components/datasets/dataset-page-client';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { fetchDatasetItems } from '@/lib/api/dataset-items';
import { fetchDataset } from '@/lib/api/datasets';

export const dynamic = 'force-dynamic';

export default async function DatasetPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/[datasetId]'>) {
  const { tenantId, projectId, datasetId } = await params;
  try {
    const [dataset, items] = await Promise.all([
      fetchDataset(tenantId, projectId, datasetId),
      fetchDatasetItems(tenantId, projectId, datasetId).catch(() => ({
        data: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      })),
    ]);

    return (
      <BodyTemplate
        breadcrumbs={[
          {
            label: 'Test Suites',
            href: `/${tenantId}/projects/${projectId}/datasets`,
          },
          { label: dataset.name || 'Test Suite' },
        ]}
      >
        <MainContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold">{dataset.name || 'Test Suite'}</h1>
              </div>
            </div>
            <DatasetPageClient
              tenantId={tenantId}
              projectId={projectId}
              datasetId={datasetId}
              items={items.data}
            />
          </div>
        </MainContent>
      </BodyTemplate>
    );
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/datasets`}
        linkText="Back to test suites"
        context="dataset"
      />
    );
  }
}
