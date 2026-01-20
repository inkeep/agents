import { DataComponentForm } from '@/components/data-components/form/data-component-form';

async function NewDataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <DataComponentForm tenantId={tenantId} projectId={projectId} className="max-w-2xl mx-auto" />
  );
}

export default NewDataComponentPage;
