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
import { AgentFilter } from '@/components/traces/filters/agent-filter';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    agentId?: string;
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
      agentId?: string;
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

      if (next.agentId !== undefined) {
        if (next.agentId) {
          params.set('agentId', next.agentId);
        } else {
          params.delete('agentId');
        }
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

  const hasActiveFilters = !!(
    filters.type ||
    filters.agentId ||
    filters.startDate ||
    filters.endDate
  );

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
        <Tabs
          value={typeFilter ?? 'all'}
          onValueChange={(value) => {
            const next = value === 'all' ? undefined : (value as 'positive' | 'negative');
            setTypeFilter(next);
            updateQuery({ type: next ?? '', page: 1 });
          }}
        >
          <TabsList>
            <TabsTrigger value="all" className="gap-1.5 font-sans normal-case">
              All
              {!typeFilter && <span className="text-xs opacity-70">{pagination.total}</span>}
            </TabsTrigger>
            <TabsTrigger value="positive" className="gap-1.5 font-sans normal-case">
              <ThumbsUp className="h-3.5 w-3.5" />
              Positive
              {positiveCount !== undefined && (
                <span className="text-xs opacity-70">{positiveCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="negative" className="gap-1.5 font-sans normal-case">
              <ThumbsDown className="h-3.5 w-3.5" />
              Negative
              {negativeCount !== undefined && (
                <span className="text-xs opacity-70">{negativeCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <AgentFilter
            selectedValue={filters.agentId}
            onSelect={(value) => {
              updateQuery({ agentId: value ?? '', page: 1 });
            }}
          />
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
        </div>
      </div>

      <Table containerClassName="rounded-lg border">
        <TableHeader>
          <TableRow noHover>
            <TableHead className="w-[170px]">Created</TableHead>
            <TableHead className="w-[90px]">Type</TableHead>
            <TableHead>Feedback</TableHead>
            <TableHead className="w-[130px]">Agent</TableHead>
            <TableHead className="w-[140px] text-right">View conversation</TableHead>
            <TableHead className="w-[140px] text-right">Delete</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedback.length === 0 && (
            <TableRow noHover>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTimeTable(item.createdAt, { local: true })}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    className="uppercase"
                    variant={item.type === 'positive' ? 'primary' : 'error'}
                  >
                    {item.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-foreground whitespace-normal">
                  {item.details ? (
                    truncate(String(item.details), 240)
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[130px]" title={item.agentId ?? undefined}>
                  {item.agentId ? (
                    <Badge variant="code" className="text-xs truncate max-w-full inline-block">
                      {item.agentId}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Link
                    href={conversationHref}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label={item.messageId ? 'View message' : 'View conversation'}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    aria-label="Delete feedback"
                    onClick={() => setDeleteFeedbackId(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
          Page {pagination.page} of {pagination.pages || 1}
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
