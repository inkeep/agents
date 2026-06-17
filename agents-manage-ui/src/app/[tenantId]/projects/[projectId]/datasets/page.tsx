import type { Metadata } from 'next';
import { DatasetsList } from '@/components/datasets/datasets-list';
import FullPageError from '@/components/errors/full-page-error';
import { Database } from '@/components/icons/empty-state/database';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchDatasets } from '@/lib/api/datasets';
import { fetchProjectPermissions } from '@/lib/api/projects';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.datasets,
  description: 'Test suites are collections of test cases used for evaluating agent performance.',
} satisfies Metadata;

async function DatasetsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/datasets'>) {
  const { tenantId, projectId } = await params;
  try {
    const [datasets, { canEdit }] = await Promise.all([
      fetchDatasets(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    return datasets.data.length ? (
      <>
        <PageHeader title={metadata.title} description={metadata.description} />
        <DatasetsList
          tenantId={tenantId}
          projectId={projectId}
          datasets={datasets.data}
          canEdit={canEdit}
        />
      </>
    ) : (
      <EmptyState
        title="No test suites yet."
        description={metadata.description}
        link={canEdit ? `/${tenantId}/projects/${projectId}/datasets/new` : undefined}
        linkText={canEdit ? 'Create test suite' : undefined}
        icon={<Database />}
      />
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="datasets" />;
  }
}

export default DatasetsPage;
