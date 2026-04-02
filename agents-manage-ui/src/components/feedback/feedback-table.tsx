'use client';

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { DeleteFeedbackConfirmation } from '@/components/feedback/delete-feedback-confirmation';
import EmptyState from '@/components/layout/empty-state';
import { DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Feedback } from '@/lib/api/feedback';
import { formatDateTimeTable } from '@/lib/utils/format-date';

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

interface FeedbackTableProps {
  tenantId: string;
  projectId: string;
  feedback: Feedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: {
    conversationId?: string;
    type?: 'positive' | 'negative';
    startDate?: string;
    endDate?: string;
  };
}

export function FeedbackTable({
  tenantId,
  projectId,
  feedback,
  pagination,
  filters,
}: FeedbackTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [typeFilter, setTypeFilter] = React.useState<'positive' | 'negative' | undefined>(
    filters.type
  );
  const [deleteFeedbackId, setDeleteFeedbackId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTypeFilter(filters.type);
  }, [filters.type]);

  const updateQuery = React.useCallback(
    (next: {
      type?: 'positive' | 'negative' | '';
      startDate?: string;
      endDate?: string;
      page?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.type === undefined) {
        // no-op
      } else if (next.type) {
        params.set('type', next.type);
      } else {
        params.delete('type');
      }

      if (next.startDate !== undefined) {
        if (next.startDate) {
          params.set('startDate', next.startDate);
        } else {
          params.delete('startDate');
        }
      }

      if (next.endDate !== undefined) {
        if (next.endDate) {
          params.set('endDate', next.endDate);
        } else {
          params.delete('endDate');
        }
      }

      if (next.page === undefined) {
        // no-op
      } else if (next.page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(next.page));
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const clearFilters = () => {
    setTypeFilter(undefined);
    updateQuery({ type: '', startDate: '', endDate: '', page: 1 });
  };

  const hasActiveFilters = !!(filters.type || filters.startDate || filters.endDate);

  if (!feedback.length && !hasActiveFilters) {
    return (
      <EmptyState
        title="No feedback yet."
        description="When users leave feedback, it will show up here."
        icon={<MessageSquare className="h-10 w-10 text-muted-foreground" />}
      />
    );
  }

  const positiveCount = typeFilter === 'positive' ? pagination.total : undefined;
  const negativeCount = typeFilter === 'negative' ? pagination.total : undefined;

  const dateRangeValue =
    filters.startDate || filters.endDate
      ? { from: filters.startDate ?? '', to: filters.endDate ?? '' }
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant={!typeFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTypeFilter(undefined);
              updateQuery({ type: '', page: 1 });
            }}
          >
            All
            <Badge variant="count" className="ml-1 text-xs">
              {!typeFilter ? pagination.total : ''}
            </Badge>
          </Button>
          <Button
            variant={typeFilter === 'positive' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={typeFilter === 'positive'}
            onClick={() => {
              const next = typeFilter === 'positive' ? undefined : ('positive' as const);
              setTypeFilter(next);
              updateQuery({ type: next ?? '', page: 1 });
            }}
          >
            <ThumbsUp className="h-3 w-3 mr-1" />
            Positive
            {positiveCount !== undefined && (
              <Badge variant="count" className="ml-1 text-xs">
                {positiveCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={typeFilter === 'negative' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={typeFilter === 'negative'}
            onClick={() => {
              const next = typeFilter === 'negative' ? undefined : ('negative' as const);
              setTypeFilter(next);
              updateQuery({ type: next ?? '', page: 1 });
            }}
          >
            <ThumbsDown className="h-3 w-3 mr-1" />
            Negative
            {negativeCount !== undefined && (
              <Badge variant="count" className="ml-1 text-xs">
                {negativeCount}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-full sm:w-auto">
            <DatePickerWithPresets
              label="Date range"
              value={dateRangeValue}
              showCalendarDirectly
              placeholder="Filter by date"
              onAdd={() => {}}
              onRemove={() => {
                updateQuery({ startDate: '', endDate: '', page: 1 });
              }}
              setCustomDateRange={(start, end) => {
                updateQuery({ startDate: start, endDate: end, page: 1 });
              }}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
              Clear
            </Button>
          )}
        </div>
      </div>

      <Table containerClassName="rounded-lg border">
        <TableHeader>
          <TableRow noHover>
            <TableHead className="w-[170px]">Created</TableHead>
            <TableHead className="w-[90px]">Type</TableHead>
            <TableHead>Feedback</TableHead>
            <TableHead className="w-[100px]">View conversation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedback.length === 0 && (
            <TableRow noHover>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No feedback found matching your filters.
              </TableCell>
            </TableRow>
          )}
          {feedback.map((item) => {
            const conversationHref = item.messageId
              ? `/${tenantId}/projects/${projectId}/traces/conversations/${item.conversationId}?messageId=${item.messageId}`
              : `/${tenantId}/projects/${projectId}/traces/conversations/${item.conversationId}`;
            return (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTimeTable(item.createdAt, { local: true })}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant={item.type === 'positive' ? 'default' : 'secondary'}>
                    {item.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-foreground whitespace-normal">
                  {item.details ? truncate(String(item.details), 240) : '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Link
                      href={conversationHref}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label={item.messageId ? 'View message' : 'View conversation'}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Delete feedback"
                      onClick={() => setDeleteFeedbackId(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {deleteFeedbackId ? (
        <DeleteFeedbackConfirmation
          tenantId={tenantId}
          projectId={projectId}
          feedbackId={deleteFeedbackId}
          isOpen={true}
          onOpenChange={(open) => {
            if (!open) setDeleteFeedbackId(null);
          }}
          onDeleted={() => router.refresh()}
        />
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Page {pagination.page} of {pagination.pages || 1} · {pagination.total} total
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => updateQuery({ page: Math.max(1, pagination.page - 1) })}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              pagination.pages
                ? pagination.page >= pagination.pages
                : feedback.length < pagination.limit
            }
            onClick={() => updateQuery({ page: pagination.page + 1 })}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
