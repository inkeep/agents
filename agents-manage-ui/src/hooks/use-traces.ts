'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type ConversationStats,
  getSigNozStatsClient,
  type PaginatedConversationStats,
  type SpanFilterOptions,
} from '@/lib/api/signoz-stats';

const _MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UseConversationStatsResult {
  stats: ConversationStats[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  pagination: {
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
}

export interface UseConversationStatsOptions {
  startTime?: number;
  endTime?: number;
  filters?: SpanFilterOptions;
  projectId?: string;
  pagination?: {
    pageSize?: number;
  };
  searchQuery?: string;
  agentId?: string;
}

export function useConversationStats(
  options?: UseConversationStatsOptions
): UseConversationStatsResult {
  const [stats, setStats] = useState<ConversationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<
    PaginatedConversationStats['pagination'] | null
  >(null);

  // Extract stable values to avoid object recreation issues
  const pageSize = options?.pagination?.pageSize || 50;

  const fetchData = useCallback(
    async (page: number = currentPage) => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient();
        // Use provided time range or default to all time (2020)
        // Clamp endTime to now-1ms to satisfy backend validation (end cannot be in the future)
        const currentEndTime = Math.min(options?.endTime || Date.now() - 1);
        const currentStartTime = options?.startTime || new Date('2020-01-01T00:00:00Z').getTime();

        const result = await client.getConversationStats(
          currentStartTime,
          currentEndTime,
          options?.filters,
          options?.projectId,
          { page, limit: pageSize },
          options?.searchQuery,
          options?.agentId
        );

        setStats(result.data);
        setPaginationInfo(result.pagination);
      } catch (err) {
        console.error('Error fetching conversation stats:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch conversation stats';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [
      options?.startTime,
      options?.endTime,
      options?.filters,
      options?.projectId,
      options?.searchQuery,
      options?.agentId,
      pageSize,
    ]
  );

  const refresh = useCallback(() => {
    fetchData(currentPage);
  }, [fetchData, currentPage]);

  // Pagination controls
  const nextPage = useCallback(() => {
    if (paginationInfo?.hasNextPage) {
      const nextPageNum = currentPage + 1;
      setCurrentPage(nextPageNum);
      fetchData(nextPageNum);
    }
  }, [currentPage, paginationInfo?.hasNextPage, fetchData]);

  const previousPage = useCallback(() => {
    if (paginationInfo?.hasPreviousPage) {
      const prevPageNum = currentPage - 1;
      setCurrentPage(prevPageNum);
      fetchData(prevPageNum);
    }
  }, [currentPage, paginationInfo?.hasPreviousPage, fetchData]);

  const goToPage = useCallback(
    (page: number) => {
      if (
        paginationInfo &&
        page >= 1 &&
        page <= paginationInfo.totalPages &&
        page !== currentPage
      ) {
        setCurrentPage(page);
        fetchData(page);
      }
    },
    [currentPage, paginationInfo, fetchData]
  );

  // Fetch when component mounts or time range changes
  // Reset to page 1 when filters or time range change
  useEffect(() => {
    setCurrentPage(1);
    fetchData(1);
  }, [fetchData]);

  return {
    stats,
    loading,
    error,
    refresh,
    pagination: paginationInfo
      ? {
          page: paginationInfo.page,
          limit: paginationInfo.limit,
          total: paginationInfo.total,
          totalPages: paginationInfo.totalPages,
          hasNextPage: paginationInfo.hasNextPage,
          hasPreviousPage: paginationInfo.hasPreviousPage,
          nextPage,
          previousPage,
          goToPage,
        }
      : {
          page: 1,
          limit: pageSize,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
          nextPage,
          previousPage,
          goToPage,
        },
  };
}

// Hook for aggregate stats only (server-side aggregation)
export function useAggregateStats(options?: {
  startTime?: number;
  endTime?: number;
  filters?: SpanFilterOptions;
  projectId?: string;
  agentId?: string;
}) {
  const [aggregateStats, setAggregateStats] = useState({
    totalToolCalls: 0,
    totalTransfers: 0,
    totalDelegations: 0,
    totalConversations: 0,
    totalAICalls: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAggregateStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const client = getSigNozStatsClient();
      const currentEndTime = Math.min(options?.endTime || Date.now() - 1);
      const currentStartTime = options?.startTime || new Date('2020-01-01T00:00:00Z').getTime();

      const stats = await client.getAggregateStats(
        currentStartTime,
        currentEndTime,
        options?.filters,
        options?.projectId,
        options?.agentId
      );

      setAggregateStats(stats);
    } catch (err) {
      console.error('Error fetching aggregate stats:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch aggregate stats';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [
    options?.startTime,
    options?.endTime,
    options?.filters,
    options?.projectId,
    options?.agentId,
  ]);

  useEffect(() => {
    fetchAggregateStats();
  }, [fetchAggregateStats]);

  return {
    aggregateStats,
    loading,
    error,
    refresh: fetchAggregateStats,
  };
}
