import type { Metadata } from 'next';
import { BranchesTable } from '@/components/branches/branches-table';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchBranches } from '@/lib/api/branches';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Branches',
  description: 'Manage configuration branches for this project.',
} satisfies Metadata;

export default async function BranchesPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;

  try {
    const response = await fetchBranches(tenantId, projectId);

    return (
      <>
        <PageHeader
          title={STATIC_LABELS.branches ?? metadata.title}
          description={metadata.description}
        />
        <BranchesTable tenantId={tenantId} projectId={projectId} branches={response.data} />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="branches" />;
  }
}
