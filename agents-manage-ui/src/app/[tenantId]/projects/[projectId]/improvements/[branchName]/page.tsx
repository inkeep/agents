import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { ImprovementBranchView } from '@/components/improvements/improvement-branch-view';
import { PageHeader } from '@/components/layout/page-header';
import { fetchConversationBounds, fetchConversationHistory } from '@/lib/api/conversations-client';
import { fetchImprovementConversation, fetchImprovementDiff } from '@/lib/api/improvements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Improvement',
  description: 'Watch the improvement agent work and review proposed changes.',
} satisfies Metadata;

const IMPROVEMENT_PROJECT_ID = 'improvement-agent';

async function loadConversation(tenantId: string, projectId: string, branchName: string, conversationId?: string) {
  let resolvedId = conversationId;

  if (!resolvedId) {
    const fallback = await fetchImprovementConversation(tenantId, projectId, branchName).catch(() => null);
    resolvedId = fallback?.conversationId ?? undefined;
  }

  if (!resolvedId) {
    return { conversationId: null, agentStatus: undefined, messages: [] };
  }

  const [bounds, history] = await Promise.all([
    fetchConversationBounds(tenantId, IMPROVEMENT_PROJECT_ID, resolvedId),
    fetchConversationHistory(tenantId, IMPROVEMENT_PROJECT_ID, resolvedId),
  ]);

  const agentStatus = ((bounds?.metadata as Record<string, unknown> | null)?.status) as string | undefined;

  const allMessages = history?.messages ?? [];
  const userMsg = allMessages.find((m: any) => m.role === 'user');
  const assistantMsg = [...allMessages].reverse().find((m: any) =>
    (m.role === 'assistant' || m.role === 'agent') && m.visibility === 'user-facing'
  );

  const messages = [
    ...(userMsg ? [{ role: userMsg.role, content: userMsg.content }] : []),
    ...(assistantMsg ? [{ role: 'assistant', content: assistantMsg.content }] : []),
  ];

  return { conversationId: resolvedId, agentStatus, messages };
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
    const [diff, conversation] = await Promise.all([
      fetchImprovementDiff(tenantId, projectId, decodedBranch),
      loadConversation(tenantId, projectId, decodedBranch, conversationId),
    ]);

    if (!conversation.agentStatus && isNewRun) {
      conversation.agentStatus = 'running';
    }

    return (
      <>
        <PageHeader
          title="Improvement"
          description={`Branch: ${decodedBranch}`}
        />
        <ImprovementBranchView
          tenantId={tenantId}
          projectId={projectId}
          diff={diff}
          branchName={decodedBranch}
          isNewRun={isNewRun}
          conversation={conversation}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="improvement" />;
  }
}
