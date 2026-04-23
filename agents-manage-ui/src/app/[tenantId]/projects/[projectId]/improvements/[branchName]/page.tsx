import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { ImprovementBranchView } from '@/components/improvements/improvement-branch-view';
import { PageHeader } from '@/components/layout/page-header';
import { fetchImprovementConversation, fetchImprovementDiff } from '@/lib/api/improvements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Improvement',
  description: 'Watch the improvement agent work and review proposed changes.',
} satisfies Metadata;

export default async function ImprovementBranchPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string; branchName: string }>;
}) {
  const { tenantId, projectId, branchName } = await params;
  const decodedBranch = decodeURIComponent(branchName);

  try {
    const [diff, conversation] = await Promise.all([
      fetchImprovementDiff(tenantId, projectId, decodedBranch),
      fetchImprovementConversation(tenantId, projectId, decodedBranch).catch(() => null),
    ]);

    return (
      <>
        <PageHeader title="Improvement" description={`Branch: ${decodedBranch}`} />
        <ImprovementBranchView
          tenantId={tenantId}
          projectId={projectId}
          diff={diff}
          branchName={decodedBranch}
          status={conversation?.status}
          feedbackItems={conversation?.feedbackItems}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="improvement" />;
  }
}
