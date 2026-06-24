import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { FeedbackTable } from '@/components/feedback/feedback-table';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchFeedback } from '@/lib/api/feedback';
import {
  ALL_TIME,
  CUSTOM_RANGE,
  resolveTimeRangeISO,
  type TimeRangeValue,
} from '@/lib/filters/time-range-filter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feedback',
  description: 'Review user feedback.',
} satisfies Metadata;

const DEFAULT_FEEDBACK_TIME_RANGE: TimeRangeValue = '7d';

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{
    conversationId?: string;
    agentId?: string;
    type?: 'positive' | 'negative';
    startDate?: string;
    endDate?: string;
    range?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const { tenantId, projectId } = await params;
  const { conversationId, agentId, type, startDate, endDate, range, page, limit } =
    await searchParams;

  const effectiveRange: TimeRangeValue =
    (range as TimeRangeValue) ??
    (startDate || endDate ? CUSTOM_RANGE : conversationId ? ALL_TIME : DEFAULT_FEEDBACK_TIME_RANGE);

  const resolvedRange = resolveTimeRangeISO({
    timeRange: effectiveRange,
    customStartDate: startDate,
    customEndDate: endDate,
  });

  try {
    const pageNumber = page ? Number.parseInt(page, 10) : 1;
    const limitNumber = limit ? Number.parseInt(limit, 10) : 25;

    const response = await fetchFeedback(tenantId, projectId, {
      conversationId,
      agentId,
      type,
      startDate: resolvedRange.startDate,
      endDate: resolvedRange.endDate,
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
          filters={{
            conversationId,
            agentId,
            type,
            startDate: startDate,
            endDate: endDate,
            range: effectiveRange,
          }}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="feedback" />;
  }
}
