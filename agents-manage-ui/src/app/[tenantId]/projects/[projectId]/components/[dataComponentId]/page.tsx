import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { fetchDataComponent } from '@/lib/api/data-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function DataComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components/[dataComponentId]'>) {
  const { tenantId, projectId, dataComponentId } = await params;

  try {
    const dataComponent = await fetchDataComponent(tenantId, projectId, dataComponentId);
    const { name, description, props, render } = dataComponent;
    return (
      <BodyTemplate
        breadcrumbs={[
          {
            label: 'Components',
            href: `/${tenantId}/projects/${projectId}/components`,
          },
          { label: dataComponent.name },
        ]}
      >
        <MainContent>
          <div className="max-w-2xl mx-auto py-4">
            <DataComponentForm
              tenantId={tenantId}
              projectId={projectId}
              id={dataComponentId}
              initialData={{
                id: dataComponentId,
                name,
                description: description ?? '',
                props,
                render,
              }}
            />
          </div>
        </MainContent>
      </BodyTemplate>
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
