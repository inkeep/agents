import { DatasetForm } from '@/components/datasets/form/dataset-form';

async function NewDatasetPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <div className="max-w-2xl mx-auto py-4">
      <DatasetForm tenantId={tenantId} projectId={projectId} />
    </div>
  );
}

export default NewDatasetPage;
