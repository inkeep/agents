'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateAgo, formatDateTime } from '@/app/utils/format-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ConversationStats, getSigNozStatsClient } from '@/lib/api/signoz-stats';
import { cn } from '@/lib/utils';

interface ConversationPickerProps {
  tenantId: string;
  projectId: string;
  startTime?: number;
  endTime?: number;
  selectedConversationIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ConversationPicker({
  tenantId,
  projectId,
  startTime,
  endTime,
  selectedConversationIds,
  onSelectionChange,
}: ConversationPickerProps) {
  const [conversations, setConversations] = useState<ConversationStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<{
    page: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  } | null>(null);

  const pageSize = 10;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchConversations = useCallback(
    async (page: number) => {
      if (!startTime || !endTime) {
        setConversations([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const client = getSigNozStatsClient(tenantId);
        const result = await client.getConversationStats(
          startTime,
          endTime,
          undefined,
          projectId,
          { page, limit: pageSize },
          debouncedSearchQuery || undefined,
          undefined
        );

        setConversations(result.data);
        setPaginationInfo({
          page: result.pagination.page,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
          hasNextPage: result.pagination.hasNextPage,
          hasPreviousPage: result.pagination.hasPreviousPage,
        });
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
        setConversations([]);
      } finally {
        setLoading(false);
      }
    },
    [tenantId, projectId, startTime, endTime, debouncedSearchQuery]
  );

  useEffect(() => {
    fetchConversations(currentPage);
  }, [fetchConversations, currentPage]);

  const toggleConversation = useCallback(
    (conversationId: string) => {
      if (selectedConversationIds.includes(conversationId)) {
        onSelectionChange(selectedConversationIds.filter((id) => id !== conversationId));
      } else {
        onSelectionChange([...selectedConversationIds, conversationId]);
      }
    },
    [selectedConversationIds, onSelectionChange]
  );

  const positiveConversations = useMemo(
    () => conversations.filter((c) => c.feedback === 'positive'),
    [conversations]
  );

  const negativeConversations = useMemo(
    () => conversations.filter((c) => c.feedback === 'negative'),
    [conversations]
  );

  const allPositiveSelected = useMemo(() => {
    if (positiveConversations.length === 0) return false;
    return positiveConversations.every((c) => selectedConversationIds.includes(c.conversationId));
  }, [positiveConversations, selectedConversationIds]);

  const allNegativeSelected = useMemo(() => {
    if (negativeConversations.length === 0) return false;
    return negativeConversations.every((c) => selectedConversationIds.includes(c.conversationId));
  }, [negativeConversations, selectedConversationIds]);

  const toggleAllPositive = useCallback(() => {
    const positiveIds = positiveConversations.map((c) => c.conversationId);
    if (allPositiveSelected) {
      onSelectionChange(selectedConversationIds.filter((id) => !positiveIds.includes(id)));
    } else {
      const newIds = [...new Set([...selectedConversationIds, ...positiveIds])];
      onSelectionChange(newIds);
    }
  }, [positiveConversations, selectedConversationIds, onSelectionChange, allPositiveSelected]);

  const toggleAllNegative = useCallback(() => {
    const negativeIds = negativeConversations.map((c) => c.conversationId);
    if (allNegativeSelected) {
      onSelectionChange(selectedConversationIds.filter((id) => !negativeIds.includes(id)));
    } else {
      const newIds = [...new Set([...selectedConversationIds, ...negativeIds])];
      onSelectionChange(newIds);
    }
  }, [negativeConversations, selectedConversationIds, onSelectionChange, allNegativeSelected]);

  const clearSearch = () => {
    setSearchQuery('');
  };

  if (!startTime || !endTime) {
    return (
      <div className="space-y-2">
        <Label className="text-sm">Specific Conversations </Label>

        <div className="border rounded-lg p-4 text-center text-muted-foreground text-sm">
          Select a date range first to browse conversations
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm">Specific Conversations</Label>
          <p className="text-xs text-muted-foreground">
            Not selecting conversations will evaluate all conversations in the date range
          </p>
        </div>
        {selectedConversationIds.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange([])}
            className="h-6 px-2 text-xs"
          >
            Clear {selectedConversationIds.length} selected
          </Button>
        )}
      </div>

      <Card className="shadow-none bg-background">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex font-medium items-center gap-4 text-foreground text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-400 dark:text-white/40" />
                Recent conversations
              </div>
              <Badge variant="code" className="text-xs">
                {paginationInfo?.total ?? 0}
              </Badge>
            </CardTitle>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/40" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-9"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-accent"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Quick select buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant={allPositiveSelected ? 'default' : 'outline'}
              size="sm"
              onClick={toggleAllPositive}
              disabled={positiveConversations.length === 0}
              className="h-7 text-xs gap-1.5"
            >
              <ThumbsUp
                className={cn('h-3 w-3', allPositiveSelected ? 'text-white' : 'text-green-600')}
              />
              {allPositiveSelected ? 'Deselect' : 'Select'} positive ({positiveConversations.length}
              )
            </Button>
            <Button
              type="button"
              variant={allNegativeSelected ? 'default' : 'outline'}
              size="sm"
              onClick={toggleAllNegative}
              disabled={negativeConversations.length === 0}
              className="h-7 text-xs gap-1.5"
            >
              <ThumbsDown
                className={cn('h-3 w-3', allNegativeSelected ? 'text-white' : 'text-red-500')}
              />
              {allNegativeSelected ? 'Deselect' : 'Select'} negative ({negativeConversations.length}
              )
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0">
          {loading ? (
            <div className="space-y-0">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="py-4 px-6 border-b border-border/50 last:border-b-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-destructive">{error}</div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery
                ? `No conversations match "${searchQuery}". Try a different search term.`
                : 'No conversations found in this date range.'}
            </div>
          ) : (
            <div className="flex flex-col max-h-[400px] overflow-y-auto">
              {conversations.map((conversation) => (
                <SelectableConversationItem
                  key={conversation.conversationId}
                  conversation={conversation}
                  isSelected={selectedConversationIds.includes(conversation.conversationId)}
                  onToggle={() => toggleConversation(conversation.conversationId)}
                />
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {paginationInfo && paginationInfo.totalPages > 1 && !loading && (
            <div className="flex items-center justify-between pt-4 px-6 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {paginationInfo.page} of {paginationInfo.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={!paginationInfo.hasPreviousPage}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous page</span>
                </Button>

                {/* Page numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, paginationInfo.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (paginationInfo.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (paginationInfo.page <= 3) {
                      pageNum = i + 1;
                    } else if (paginationInfo.page >= paginationInfo.totalPages - 2) {
                      pageNum = paginationInfo.totalPages - 4 + i;
                    } else {
                      pageNum = paginationInfo.page - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        type="button"
                        variant={pageNum === paginationInfo.page ? 'outline-primary' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="h-8 w-8 p-0 font-mono"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!paginationInfo.hasNextPage}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next page</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Conversations Summary */}
      {selectedConversationIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedConversationIds.length} conversation
          {selectedConversationIds.length !== 1 ? 's' : ''} selected for evaluation
        </p>
      )}
    </div>
  );
}

interface SelectableConversationItemProps {
  conversation: ConversationStats;
  isSelected: boolean;
  onToggle: () => void;
}

function SelectableConversationItem({
  conversation,
  isSelected,
  onToggle,
}: SelectableConversationItemProps) {
  const {
    conversationId,
    firstUserMessage,
    agentId,
    agentName,
    hasErrors,
    totalErrors,
    startTime,
    feedback,
  } = conversation;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full text-left hover:bg-muted/50 transition-colors py-4 px-6 border-border/50 border-b last:border-b-0',
        isSelected && 'bg-primary/5'
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <div className="pt-0.5">
              <div
                className={cn(
                  'h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0',
                  isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </div>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {firstUserMessage || 'No user message'}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <code className="font-mono text-gray-500 dark:text-white/50">{conversationId}</code>
                {startTime &&
                  (() => {
                    try {
                      const date = new Date(startTime);
                      if (Number.isNaN(date.getTime())) return null;

                      const isoString = date.toISOString();
                      return (
                        <>
                          <span className="text-gray-400 dark:text-white/40">•</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-gray-400 dark:text-white/40 cursor-help">
                                {formatDateAgo(isoString)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Started: {formatDateTime(isoString)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      );
                    } catch {
                      return null;
                    }
                  })()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {feedback && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`flex items-center gap-1 ${
                      feedback === 'positive'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {feedback === 'positive' ? (
                      <ThumbsUp className="size-4" />
                    ) : (
                      <ThumbsDown className="size-4" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    User feedback: {feedback === 'positive' ? 'Positive' : 'Negative'}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {hasErrors && (
              <Badge variant="error" className="flex items-center gap-1">
                {totalErrors} Error{totalErrors > 1 ? 's' : ''}
              </Badge>
            )}
            <Badge variant="code" className="text-xs">
              {agentName ? `${agentName} (${agentId})` : agentId}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  );
}
