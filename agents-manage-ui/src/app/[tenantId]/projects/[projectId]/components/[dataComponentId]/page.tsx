import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { fetchDataComponent } from '@/lib/api/data-components';
import { serializeJson } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function DataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/[dataComponentId]'>) {
  const { tenantId, projectId, dataComponentId } = await params;

  try {
    const { name, description, props, render } = await fetchDataComponent(
      tenantId,
      projectId,
      dataComponentId
    );

    return (
      <DataComponentForm
        className="max-w-2xl mx-auto"
        tenantId={tenantId}
        projectId={projectId}
        id={dataComponentId}
        defaultValues={{
          id: dataComponentId,
          name,
          description: description ?? '',
          props: serializeJson(props),
          render,
        }}
      />
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects/${projectId}/components`}
        linkText="Back to components"
        context="component"
      />
    );
  }
}
