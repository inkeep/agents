import { DataComponentForm } from '@/components/data-components/form/data-component-form';
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
    <DataComponentForm tenantId={tenantId} projectId={projectId} className="max-w-2xl mx-auto" />
  );
}

export default NewDataComponentPage;
