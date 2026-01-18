import { Plus } from 'lucide-react';
import Link from 'next/link';
import { DataComponentsList } from '@/components/data-components/data-components-list';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { dataComponentDescription } from '@/constants/page-descriptions';
import { fetchDataComponents } from '@/lib/api/data-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function DataComponentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components'>) {
  const { tenantId, projectId } = await params;

  try {
    const dataComponents = await fetchDataComponents(tenantId, projectId);
    const content = dataComponents.data.length ? (
      <>
        <PageHeader
          title="Components"
          description={dataComponentDescription}
          action={
            <Button asChild={true}>
              <Link
                href={`/${tenantId}/projects/${projectId}/components/new`}
                className="flex items-center gap-2"
              >
                <Plus className="size-4" />
                New component
              </Link>
            </Button>
          }
        />
        <DataComponentsList
          tenantId={tenantId}
          projectId={projectId}
          dataComponents={dataComponents.data}
        />
      </>
    ) : (
      <EmptyState
        title="No components yet."
        description={dataComponentDescription}
        link={`/${tenantId}/projects/${projectId}/components/new`}
        linkText="Create component"
      />
    );
    return <BodyTemplate breadcrumbs={['Components']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="components" />;
  }
}

export default DataComponentsPage;
