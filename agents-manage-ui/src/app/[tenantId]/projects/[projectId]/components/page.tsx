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
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function DataComponentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/components'>) {
  const { tenantId, projectId } = await params;

  try {
    const [{ data }, permissions] = await Promise.all([
      fetchDataComponents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);

    const canEdit = permissions.canEdit;

    const content = data.length ? (
      <>
        <PageHeader
          title="Components"
          description={dataComponentDescription}
          action={
            canEdit ? (
              <Button asChild>
                <Link
                  href={`/${tenantId}/projects/${projectId}/components/new`}
                  className="flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  New component
                </Link>
              </Button>
            ) : undefined
          }
        />
        <DataComponentsList tenantId={tenantId} projectId={projectId} dataComponents={data} />
      </>
    ) : (
      <EmptyState
        title="No components yet."
        description={dataComponentDescription}
        link={canEdit ? `/${tenantId}/projects/${projectId}/components/new` : undefined}
        linkText={canEdit ? 'Create component' : undefined}
      />
    );
    return <BodyTemplate breadcrumbs={['Components']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="components" />;
  }
}

export default DataComponentsPage;
