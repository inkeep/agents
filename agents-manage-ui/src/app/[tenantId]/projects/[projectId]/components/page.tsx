import { Plus } from 'lucide-react';
import Link from 'next/link';
import { DataComponentsList } from '@/components/data-components/data-components-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { dataComponentDescription } from '@/constants/page-descriptions';
import { fetchDataComponents } from '@/lib/api/data-components';

export const dynamic = 'force-dynamic';

interface DataComponentsPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function DataComponentsPage({ params }: DataComponentsPageProps) {
  const { tenantId, projectId } = await params;
  const dataComponents = await fetchDataComponents(tenantId, projectId);
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Components' }]}>
      <MainContent className="min-h-full">
        {dataComponents.data.length > 0 ? (
          <>
            <PageHeader
              title="Components"
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
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default DataComponentsPage;
