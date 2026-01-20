import { DatasetRunDetails } from '@/components/datasets/dataset-run-details';

export const dynamic = 'force-dynamic';

export default async function DatasetRunPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/[datasetId]/runs/[runId]'>) {
  const { tenantId, projectId, datasetId, runId } = await params;

  return (
    <DatasetRunDetails
      tenantId={tenantId}
      projectId={projectId}
      datasetId={datasetId}
      runId={runId}
    />
  );
}
