import { DataComponentForm } from '@/components/data-components/form/data-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { fetchDataComponent } from '@/lib/api/data-components';

export const dynamic = 'force-dynamic';

interface DataComponentPageProps {
  params: Promise<{
    tenantId: string;
    projectId: string;
    dataComponentId: string;
  }>;
}

export default async function DataComponentPage({ params }: DataComponentPageProps) {
  const { tenantId, projectId, dataComponentId } = await params;

  let dataComponent: Awaited<ReturnType<typeof fetchDataComponent>>;
  try {
    dataComponent = await fetchDataComponent(tenantId, projectId, dataComponentId);
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/components`}
        linkText="Back to components"
        context="component"
      />
    );
  }

  const { name, description, props, preview } = dataComponent;
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
              preview,
            }}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
