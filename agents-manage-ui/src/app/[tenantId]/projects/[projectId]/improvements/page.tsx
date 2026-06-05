import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { ImprovementsTable } from '@/components/improvements/improvements-table';
import { PageHeader } from '@/components/layout/page-header';
import { fetchImprovements } from '@/lib/api/improvements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Branches',
  description: 'Review and manage improvement proposals for your agents.',
} satisfies Metadata;

export default async function ImprovementsPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;

  try {
    const response = await fetchImprovements(tenantId, projectId);

    return (
      <>
        <PageHeader title="Branches" description={metadata.description} />
        <ImprovementsTable tenantId={tenantId} projectId={projectId} improvements={response.data} />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="improvements" />;
  }
}
