import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/require-project-permission';

async function NewDataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/new'>) {
  const { tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/components`
  );

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
