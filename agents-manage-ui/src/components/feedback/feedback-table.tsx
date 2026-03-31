'use client';

import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import { DeleteFeedbackConfirmation } from '@/components/feedback/delete-feedback-confirmation';
import EmptyState from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [conversationId, setConversationId] = React.useState(filters.conversationId ?? '');
  const [typeFilter, setTypeFilter] = React.useState<'positive' | 'negative' | undefined>(filters.type);
  const [deleteFeedbackId, setDeleteFeedbackId] = React.useState<string | null>(null);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setConversationId(filters.conversationId ?? '');
    setTypeFilter(filters.type);
  }, [filters.conversationId, filters.type]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateQuery = React.useCallback(
    (next: { conversationId?: string; type?: 'positive' | 'negative' | ''; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.conversationId === undefined) {
        // no-op
      } else if (next.conversationId) {
        params.set('conversationId', next.conversationId);
      } else {
        params.delete('conversationId');
      }

      if (next.type === undefined) {
        // no-op
      } else if (next.type) {
        params.set('type', next.type);
      } else {
        params.delete('type');
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

  const debouncedConversationFilter = React.useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateQuery({ conversationId: value, page: 1 });
      }, 300);
    },
    [updateQuery]
  );

  const clearFilters = () => {
    setConversationId('');
    setTypeFilter(undefined);
    updateQuery({ conversationId: '', type: '', page: 1 });
  };

  const hasActiveFilters = !!(filters.conversationId || filters.type);

  if (!feedback.length && !hasActiveFilters) {
    return (
      <EmptyState
        title="No feedback yet."
        description="When users leave feedback, it will show up here."
        icon={<MessageSquare className="h-10 w-10 text-muted-foreground" />}
      />
    );
  }

  return (
    <Card className="shadow-none bg-background">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground font-medium">
            <MessageSquare className="h-4 w-4 text-gray-400 dark:text-white/40" />
            Feedback
            <Badge variant="count" className="text-xs">
              {pagination.total}
            </Badge>
          </CardTitle>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex items-center gap-1">
              <Button
                variant={typeFilter === 'positive' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = typeFilter === 'positive' ? undefined : 'positive' as const;
                  setTypeFilter(next);
                  updateQuery({ type: next ?? '', page: 1 });
                }}
              >
                <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                Positive
              </Button>
              <Button
                variant={typeFilter === 'negative' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = typeFilter === 'negative' ? undefined : 'negative' as const;
                  setTypeFilter(next);
                  updateQuery({ type: next ?? '', page: 1 });
                }}
              >
                <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                Negative
              </Button>
            </div>

            <div className="relative w-full md:w-[260px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/40" />
              <Input
                value={conversationId}
                onChange={(e) => {
                  const v = e.target.value;
                  setConversationId(v);
                  debouncedConversationFilter(v);
                }}
                placeholder="Filter by conversationId"
                className="pl-8 pr-8"
              />
              {conversationId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  onClick={() => {
                    setConversationId('');
                    debouncedConversationFilter('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {(conversationId || typeFilter) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Table containerClassName="rounded-lg border">
          <TableHeader>
            <TableRow noHover>
              <TableHead className="w-[170px]">Created</TableHead>
              <TableHead className="w-[90px]">Type</TableHead>
              <TableHead className="w-[120px]">Conversation</TableHead>
              <TableHead>Feedback</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {feedback.map((item) => {
              const conversationHref = `/${tenantId}/projects/${projectId}/traces/conversations/${item.conversationId}`;
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
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={item.messageId ? `${conversationHref}?messageId=${item.messageId}` : conversationHref}
                      className="text-sm text-primary hover:underline"
                    >
                      {item.messageId ? 'View message' : 'View conversation'}
                    </Link>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                      {item.conversationId}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground whitespace-normal">
                    {item.details ? truncate(String(item.details), 240) : '-'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
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

        <div className="flex items-center justify-between mt-4">
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
      </CardContent>
    </Card>
  );
}
