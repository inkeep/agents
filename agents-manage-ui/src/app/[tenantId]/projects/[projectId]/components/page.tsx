import { Plus } from 'lucide-react';
import Link from 'next/link';
import { DataComponentItem } from '@/components/data-components/data-component-item';
import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { dataComponentDescription } from '@/constants/page-descriptions';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchDataComponents } from '@/lib/api/data-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function DataComponentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components'>) {
  const { tenantId, projectId } = await params;

  try {
    const { data } = await fetchDataComponents(tenantId, projectId);
    return data.length ? (
      <>
        <PageHeader
          title={STATIC_LABELS.components}
          description={dataComponentDescription}
          action={
            <Button asChild>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {data.map((dataComponent) => (
            <DataComponentItem
              key={dataComponent.id}
              {...dataComponent}
              tenantId={tenantId}
              projectId={projectId}
            />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No components yet."
        description={dataComponentDescription}
        link={`/${tenantId}/projects/${projectId}/components/new`}
        linkText="Create component"
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="components" />;
  }
}

export default DataComponentsPage;
