import { DataComponentForm } from '@/components/data-components/form/data-component-form';

async function NewDataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <div className="max-w-2xl mx-auto">
      <DataComponentForm tenantId={tenantId} projectId={projectId} />
    </div>
  );
}

export default NewDataComponentPage;
