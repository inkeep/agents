'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { TraceOrigin } from '@/hooks/use-traces-query-state';
import {
  type AggregateStats,
  type ConversationStats,
  getSigNozStatsClient,
  type PaginatedConversationStats,
  type SpanFilterOptions,
} from '@/lib/api/signoz-stats';

interface UseConversationStatsResult {
  stats: ConversationStats[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  aggregateStats: AggregateStats;
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

interface UseConversationStatsOptions {
  startTime?: number;
  endTime?: number;
  filters?: SpanFilterOptions;
  projectId?: string;
  tenantId?: string;
  pagination?: {
    pageSize?: number;
  };
  searchQuery?: string;
  agentId?: string;
  hasErrors?: boolean;
  origin?: TraceOrigin;
}

const DEFAULT_AGGREGATE_STATS: AggregateStats = {
  totalToolCalls: 0,
  totalTransfers: 0,
  totalDelegations: 0,
  totalConversations: 0,
  totalAICalls: 0,
};

export function useConversationStats(
  options: UseConversationStatsOptions
): UseConversationStatsResult {
  const [stats, setStats] = useState<ConversationStats[]>([]);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<
    PaginatedConversationStats['pagination'] | null
  >(null);
  const [aggregateStats, setAggregateStats] = useState<AggregateStats>(DEFAULT_AGGREGATE_STATS);
  const abortRef = useRef<AbortController | null>(null);

  const pageSize = options.pagination?.pageSize || 50;
  const filtersKey = options.filters ? JSON.stringify(options.filters) : '';

  function fetchData(page: number) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    startLoading(async () => {
      try {
        setError(null);

        const client = getSigNozStatsClient(options.tenantId);
        // Use provided time range or default to all time (2020)
        // Clamp endTime to now-1ms to satisfy backend validation (end cannot be in the future)
        const currentEndTime = Math.min(options.endTime || Date.now() - 1);
        const currentStartTime = options.startTime || new Date('2020-01-01T00:00:00Z').getTime();

        const result = await client.getConversationStats(
          currentStartTime,
          currentEndTime,
          options.filters,
          options.projectId,
          { page, limit: pageSize },
          options.searchQuery,
          options.agentId,
          options.hasErrors,
          options.origin,
          controller.signal
        );

        if (controller.signal.aborted) return;

        setStats(result.data);
        setPaginationInfo(result.pagination);
        if (result.aggregateStats) {
          setAggregateStats(result.aggregateStats);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Error fetching conversation stats:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch conversation stats';
        setError(errorMessage);
      }
    });
  }

  function refresh() {
    fetchData(currentPage);
  }

  // Pagination controls
  function nextPage() {
    if (paginationInfo?.hasNextPage) {
      const nextPageNum = currentPage + 1;
      setCurrentPage(nextPageNum);
      fetchData(nextPageNum);
    }
  }

  function previousPage() {
    if (paginationInfo?.hasPreviousPage) {
      const prevPageNum = currentPage - 1;
      setCurrentPage(prevPageNum);
      fetchData(prevPageNum);
    }
  }

  function goToPage(page: number) {
    if (paginationInfo && page >= 1 && page <= paginationInfo.totalPages && page !== currentPage) {
      setCurrentPage(page);
      fetchData(page);
    }
  }

  // Reset to page 1 and fetch when filters or time range change
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally tracking filter values instead of fetchData to prevent page reset on pagination clicks
  useEffect(() => {
    setCurrentPage(1);
    fetchData(1);
    return () => abortRef.current?.abort();
  }, [
    options.startTime,
    options.endTime,
    filtersKey,
    options.projectId,
    options.tenantId,
    options.searchQuery,
    options.agentId,
    options.hasErrors,
    options.origin,
    pageSize,
  ]);

  return {
    stats,
    loading,
    error,
    refresh,
    aggregateStats,
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

// Hook for project overview stats (across all projects)
export function useProjectOverviewStats(options: {
  startTime?: number;
  endTime?: number;
  projectIds?: string[];
  tenantId?: string;
}) {
  const [stats, setStats] = useState({
    totalConversations: 0,
    avgUserMessagesPerConversation: 0,
    totalUserMessages: 0,
    totalTriggerInvocations: 0,
    totalSlackMessages: 0,
    totalAICalls: 0,
    totalMCPCalls: 0,
  });
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fetchStats() {
    startLoading(async () => {
      try {
        setError(null);

        const client = getSigNozStatsClient(options.tenantId);
        const currentEndTime = Math.min(options.endTime || Date.now() - 1);
        const currentStartTime = options.startTime || new Date('2020-01-01T00:00:00Z').getTime();

        const result = await client.getProjectOverviewStats(
          currentStartTime,
          currentEndTime,
          options.projectIds
        );

        setStats(result);
      } catch (err) {
        console.error('Error fetching project overview stats:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch project overview stats';
        setError(errorMessage);
      }
    });
  }

  useEffect(() => {
    fetchStats();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchStats,
  ]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}

// Hook for conversations per day across projects
export function useConversationsPerDayAcrossProjects(options: {
  startTime?: number;
  endTime?: number;
  projectIds?: string[];
  tenantId?: string;
}) {
  const [data, setData] = useState<{ date: string; count: number }[]>([]);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    startLoading(async () => {
      try {
        setError(null);

        const client = getSigNozStatsClient(options.tenantId);
        const currentEndTime = Math.min(options.endTime || Date.now() - 1);
        const currentStartTime = options.startTime || new Date('2020-01-01T00:00:00Z').getTime();

        const result = await client.getConversationsPerDayAcrossProjects(
          currentStartTime,
          currentEndTime,
          options.projectIds
        );

        setData(result);
      } catch (err) {
        console.error('Error fetching conversations per day:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch conversations per day';
        setError(errorMessage);
      }
    });
  }

  useEffect(() => {
    fetchData();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchData,
  ]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}

// Hook for stats broken down by project
export function useStatsByProject(options: {
  startTime?: number;
  endTime?: number;
  projectIds?: string[];
  tenantId?: string;
}) {
  const [data, setData] = useState<
    Array<{
      projectId: string;
      totalConversations: number;
      totalAICalls: number;
      totalMCPCalls: number;
    }>
  >([]);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    startLoading(async () => {
      try {
        setError(null);

        const client = getSigNozStatsClient(options.tenantId);
        const currentEndTime = Math.min(options.endTime || Date.now() - 1);
        const currentStartTime = options.startTime || new Date('2020-01-01T00:00:00Z').getTime();

        const result = await client.getStatsByProject(
          currentStartTime,
          currentEndTime,
          options.projectIds
        );

        setData(result);
      } catch (err) {
        console.error('Error fetching stats by project:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch stats by project';
        setError(errorMessage);
      }
    });
  }

  useEffect(() => {
    fetchData();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchData,
  ]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}
