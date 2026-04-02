import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { FeedbackTable } from '@/components/feedback/feedback-table';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchFeedback } from '@/lib/api/feedback';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feedback',
  description: 'Review user feedback.',
} satisfies Metadata;

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{
    conversationId?: string;
    type?: 'positive' | 'negative';
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const { tenantId, projectId } = await params;
  const { conversationId, type, startDate, endDate, page, limit } = await searchParams;

  try {
    const pageNumber = page ? Number.parseInt(page, 10) : 1;
    const limitNumber = limit ? Number.parseInt(limit, 10) : 25;

    const response = await fetchFeedback(tenantId, projectId, {
      conversationId,
      type,
      startDate,
      endDate,
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      limit: Number.isFinite(limitNumber) ? limitNumber : 25,
    });

    return (
      <>
        <PageHeader
          title={STATIC_LABELS.feedback ?? metadata.title}
          description={metadata.description}
        />
        <FeedbackTable
          tenantId={tenantId}
          projectId={projectId}
          feedback={response.data}
          pagination={response.pagination}
          filters={{ conversationId, type, startDate, endDate }}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="feedback" />;
  }
}
