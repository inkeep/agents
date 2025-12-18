import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import { BodyTemplate } from '@/components/layout/body-template';

async function NewDataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Components',
          href: `/${tenantId}/projects/${projectId}/components`,
        },
        'New Component',
      ]}
      className="max-w-2xl mx-auto"
    >
      <DataComponentForm tenantId={tenantId} projectId={projectId} />
    </BodyTemplate>
  );
}

export default NewDataComponentPage;
