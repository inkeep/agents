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
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string; branchName: string }>;
  searchParams: Promise<{ status?: string; conversationId?: string }>;
}) {
  const { tenantId, projectId, branchName } = await params;
  const { status } = await searchParams;
  const decodedBranch = decodeURIComponent(branchName);
  const isNewRun = status === 'running';

  try {
    const [diff, conversation] = await Promise.all([
      fetchImprovementDiff(tenantId, projectId, decodedBranch),
      fetchImprovementConversation(tenantId, projectId, decodedBranch).catch(() => null),
    ]);

    const agentStatus = conversation?.agentStatus ?? (isNewRun ? 'running' : undefined);

    return (
      <>
        <PageHeader title="Improvement" description={`Branch: ${decodedBranch}`} />
        <ImprovementBranchView
          tenantId={tenantId}
          projectId={projectId}
          diff={diff}
          branchName={decodedBranch}
          isNewRun={isNewRun}
          agentStatus={agentStatus}
          conversationId={conversation?.conversationId ?? undefined}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="improvement" />;
  }
}
