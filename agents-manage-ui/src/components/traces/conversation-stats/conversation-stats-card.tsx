'use client';

import { ChevronLeft, ChevronRight, MessageSquare, Search, X } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ConversationStats } from '@/lib/api/signoz-stats';
import EmptyState from '../../layout/empty-state';
import { ConversationListItem } from './conversation-list-item';
import { LoadingSkeleton } from './loading-skeleton';

interface ConversationStatsCardProps {
  stats: ConversationStats[];
  loading: boolean;
  error: string | null;
  projectId: string;
  selectedTimeRange?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextPage: () => void;
    previousPage: () => void;
    goToPage: (page: number) => void;
  };
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function ConversationStatsCard({
  stats,
  loading,
  error,
  projectId,
  selectedTimeRange,
  pagination,
  searchQuery = '',
  onSearchChange,
}: ConversationStatsCardProps) {
  const [localQuery, setLocalQuery] = React.useState<string>(searchQuery);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const debouncedSearch = React.useCallback(
    (query: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        try {
          onSearchChange?.(query);
          setSearchError(null);
        } catch (error) {
          console.error('Search failed:', error);
          setSearchError('Search failed. Please try again.');
        }
      }, 300);
    },
    [onSearchChange]
  );

  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const clearSearch = () => {
    setLocalQuery('');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    try {
      onSearchChange?.('');
      setSearchError(null);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError('Search failed. Please try again.');
    }
  };

  if (error) {
    return (
      <Card className="shadow-none bg-background">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <MessageSquare className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load conversation stats</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none bg-background mt-8 pb-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex font-medium items-center gap-4 text-foreground">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-400 dark:text-white/40" />
              Recent Conversations
            </div>

            <Badge variant="code" className="text-xs">
              {pagination?.total || stats.length}
            </Badge>
          </CardTitle>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/40" />
            <Input
              placeholder="Search conversations..."
              value={localQuery}
              onChange={(e) => {
                const v = e.target.value;
                setLocalQuery(v);
                debouncedSearch(v);
              }}
              className="pl-8 pr-8"
            />
            {localQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-accent"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {searchError && (
              <p className="absolute left-0 -bottom-5 text-xs text-red-500">{searchError}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <LoadingSkeleton key={i} />
            ))}
          </div>
        ) : stats.length > 0 ? (
          <div className="flex flex-col">
            {stats.map((conversation) => (
              <ConversationListItem
                key={conversation.conversationId}
                conversation={conversation}
                projectId={projectId}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              localQuery
                ? 'No conversations found'
                : selectedTimeRange === '24h'
                  ? 'No conversation statistics found.'
                  : `No data for ${selectedTimeRange === '7d' ? '7 days' : selectedTimeRange === '15d' ? '15 days' : 'this time range'}`
            }
            description={
              localQuery
                ? `No conversations match "${localQuery}". Try a different search term.`
                : selectedTimeRange === '24h'
                  ? 'Tool calls will appear here when conversations use tools.'
                  : `Try selecting a shorter time range (like 24 hours) as data may only be retained for a few days.`
            }
          />
        )}

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && !searchQuery && (
          <div className="flex items-center justify-between pt-4 px-6 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={pagination.previousPage}
                disabled={!pagination.hasPreviousPage}
                className="h-8 w-8 p-0 relative"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous page</span>
              </Button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === pagination.page ? 'outline-primary' : 'ghost'}
                      size="sm"
                      onClick={() => pagination.goToPage(pageNum)}
                      className="h-8 w-8 p-0 font-mono"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={pagination.nextPage}
                disabled={!pagination.hasNextPage}
                className="h-8 w-8 p-0 relative"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
