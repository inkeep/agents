import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { ImprovementBranchView } from '@/components/improvements/improvement-branch-view';
import { PageHeader } from '@/components/layout/page-header';
import { fetchConversationBounds } from '@/lib/api/conversations-client';
import { fetchImprovementConversation, fetchImprovementDiff } from '@/lib/api/improvements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Improvement',
  description: 'Watch the improvement agent work and review proposed changes.',
} satisfies Metadata;

const IMPROVEMENT_PROJECT_ID = 'improvement-agent';

async function loadAgentStatus(
  tenantId: string,
  projectId: string,
  branchName: string,
  conversationId?: string
): Promise<string | undefined> {
  let resolvedId = conversationId;

  if (!resolvedId) {
    const fallback = await fetchImprovementConversation(tenantId, projectId, branchName).catch(
      () => null
    );
    resolvedId = fallback?.conversationId ?? undefined;
  }

  if (!resolvedId) return undefined;

  const bounds = await fetchConversationBounds(tenantId, IMPROVEMENT_PROJECT_ID, resolvedId);
  return (bounds?.metadata as Record<string, unknown> | null)?.status as string | undefined;
}

export default async function ImprovementBranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string; branchName: string }>;
  searchParams: Promise<{ status?: string; conversationId?: string }>;
}) {
  const { tenantId, projectId, branchName } = await params;
  const { status, conversationId } = await searchParams;
  const decodedBranch = decodeURIComponent(branchName);
  const isNewRun = status === 'running';

  try {
    const [diff, agentStatus] = await Promise.all([
      fetchImprovementDiff(tenantId, projectId, decodedBranch),
      loadAgentStatus(tenantId, projectId, decodedBranch, conversationId),
    ]);

    const resolvedStatus = agentStatus ?? (isNewRun ? 'running' : undefined);

    return (
      <>
        <PageHeader title="Improvement" description={`Branch: ${decodedBranch}`} />
        <ImprovementBranchView
          tenantId={tenantId}
          projectId={projectId}
          diff={diff}
          branchName={decodedBranch}
          isNewRun={isNewRun}
          agentStatus={resolvedStatus}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="improvement" />;
  }
}
