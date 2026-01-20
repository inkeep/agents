import { DatasetForm } from '@/components/datasets/form/dataset-form';

async function NewDatasetPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/new'>) {
  const { tenantId, projectId } = await params;
  return <DatasetForm tenantId={tenantId} projectId={projectId} />;
}

export default NewDatasetPage;
