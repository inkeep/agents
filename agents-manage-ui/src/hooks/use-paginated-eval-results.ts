import { useEffect, useRef, useState } from 'react';
import type { PaginatedEvalResultsResponse } from '@/lib/api/evaluation-results';
import {
  fetchAllEvaluationResults,
  fetchEvaluationResultsPaginated,
} from '@/lib/api/evaluation-results';
import type { Evaluator } from '@/lib/api/evaluators';
import type { EvaluationResultFilters } from '@/lib/evaluation/filter-evaluation-results';
import { filterEvaluationResults } from '@/lib/evaluation/filter-evaluation-results';

const PAGE_SIZE = 50;

type AnyRecord = Record<string, unknown>;

function deriveOutputKeys(results: { output?: AnyRecord | null }[]): string[] {
  const keys = new Set<string>();
  for (const r of results) {
    const output = r.output && typeof r.output === 'object' ? (r.output as AnyRecord).output : null;
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      for (const k of Object.keys(output as AnyRecord)) {
        keys.add(`output.${k}`);
      }
    }
  }
  return [...keys].sort();
}

interface UsePaginatedEvalResultsOptions {
  tenantId: string;
  projectId: string;
  kind: 'job-config' | 'run-config';
  configId: string;
  initialResponse: PaginatedEvalResultsResponse;
  evaluators: Evaluator[];
  pollIntervalMs?: number;
  conversationId?: string;
}

export function usePaginatedEvalResults({
  tenantId,
  projectId,
  kind,
  configId,
  initialResponse,
  evaluators,
  pollIntervalMs = 5000,
  conversationId,
}: UsePaginatedEvalResultsOptions) {
  const [filters, setFilters] = useState<EvaluationResultFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [response, setResponse] = useState<PaginatedEvalResultsResponse>(initialResponse);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasComplexFilters =
    !!filters.searchInput ||
    (!!filters.status && filters.status !== 'all') ||
    (filters.outputFilters ?? []).some((f) => f.key.trim());

  useEffect(() => {
    let cancelled = false;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (!hasComplexFilters) {
          const res = await fetchEvaluationResultsPaginated(tenantId, projectId, kind, configId, {
            page: currentPage,
            limit: PAGE_SIZE,
            evaluatorId: filters.evaluatorId || undefined,
            agentId: filters.agentId || undefined,
            conversationId: conversationId || undefined,
          });
          if (cancelled) return;
          setResponse(res);
          if (res.pagination.pages > 0 && currentPage > res.pagination.pages) {
            setCurrentPage(res.pagination.pages);
          }
        } else {
          const allResults = await fetchAllEvaluationResults(tenantId, projectId, kind, configId, {
            evaluatorId: filters.evaluatorId || undefined,
            agentId: filters.agentId || undefined,
            conversationId: conversationId || undefined,
          });
          if (cancelled) return;
          const filtered = filterEvaluationResults(allResults, filters, evaluators);
          const completedAll = allResults.filter((r) => r.output != null).length;
          const allAgentIds = [
            ...new Set(allResults.flatMap((r) => (r.agentId ? [r.agentId] : []))),
          ].sort();
          const allOutputKeys = deriveOutputKeys(allResults);
          const total = filtered.length;
          const pages = Math.ceil(total / PAGE_SIZE);
          const safePage = Math.min(currentPage, Math.max(1, pages));
          const offset = (safePage - 1) * PAGE_SIZE;
          setResponse({
            data: filtered.slice(offset, offset + PAGE_SIZE),
            pagination: {
              page: safePage,
              limit: PAGE_SIZE,
              total,
              pages,
              completedCount: completedAll,
            },
            distinctAgentIds: allAgentIds,
            distinctOutputKeys: allOutputKeys,
          });
          if (currentPage > pages && pages > 0) {
            setCurrentPage(pages);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching results:', error);
      }
      if (!cancelled) setIsLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    currentPage,
    filters,
    hasComplexFilters,
    tenantId,
    projectId,
    configId,
    evaluators,
    kind,
    conversationId,
  ]);

  const hasPendingOnPage = response.data.some((r) => r.output === null || r.output === undefined);
  const completedCount = response.pagination.completedCount ?? response.pagination.total;
  const pendingTotal = response.pagination.total - completedCount;
  const isRunning = pendingTotal > 0;

  useEffect(() => {
    if (!hasPendingOnPage && !isRunning) return;

    let cancelled = false;

    async function handlePoll() {
      if (document.visibilityState === 'hidden') return;
      try {
        if (!hasComplexFilters) {
          const res = await fetchEvaluationResultsPaginated(tenantId, projectId, kind, configId, {
            page: currentPage,
            limit: PAGE_SIZE,
            evaluatorId: filters.evaluatorId || undefined,
            agentId: filters.agentId || undefined,
            conversationId: conversationId || undefined,
          });
          if (cancelled) return;
          setResponse(res);
          if (res.pagination.pages > 0 && currentPage > res.pagination.pages) {
            setCurrentPage(res.pagination.pages);
          }
        } else {
          const allResults = await fetchAllEvaluationResults(tenantId, projectId, kind, configId, {
            evaluatorId: filters.evaluatorId || undefined,
            agentId: filters.agentId || undefined,
            conversationId: conversationId || undefined,
          });
          if (cancelled) return;
          const filtered = filterEvaluationResults(allResults, filters, evaluators);
          const completedAll = allResults.filter((r) => r.output != null).length;
          const allAgentIds = [
            ...new Set(allResults.flatMap((r) => (r.agentId ? [r.agentId] : []))),
          ].sort();
          const allOutputKeys = deriveOutputKeys(allResults);
          const total = filtered.length;
          const pages = Math.ceil(total / PAGE_SIZE);
          const safePage = Math.min(currentPage, Math.max(1, pages));
          const offset = (safePage - 1) * PAGE_SIZE;
          setResponse({
            data: filtered.slice(offset, offset + PAGE_SIZE),
            pagination: {
              page: safePage,
              limit: PAGE_SIZE,
              total,
              pages,
              completedCount: completedAll,
            },
            distinctAgentIds: allAgentIds,
            distinctOutputKeys: allOutputKeys,
          });
          if (safePage !== currentPage && pages > 0) {
            setCurrentPage(safePage);
          }
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }

    const interval = setInterval(handlePoll, pollIntervalMs);
    document.addEventListener('visibilitychange', handlePoll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handlePoll);
    };
  }, [
    hasPendingOnPage,
    isRunning,
    currentPage,
    filters,
    hasComplexFilters,
    tenantId,
    projectId,
    configId,
    evaluators,
    kind,
    pollIntervalMs,
    conversationId,
  ]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportCsv() {
    setIsExporting(true);
    setExportError(null);
    const allResults = await fetchAllEvaluationResults(tenantId, projectId, kind, configId, {
      evaluatorId: filters.evaluatorId || undefined,
      agentId: filters.agentId || undefined,
      conversationId: conversationId || undefined,
    }).catch((error) => {
      console.error('Export failed:', error);
      setExportError('Export failed. Please try again.');
      return null;
    });
    if (!allResults) {
      setIsExporting(false);
      return null;
    }
    const result = hasComplexFilters
      ? filterEvaluationResults(allResults, filters, evaluators)
      : allResults;
    setIsExporting(false);
    return result;
  }

  function handleFiltersChange(newFilters: EvaluationResultFilters) {
    setFilters(newFilters);
    setCurrentPage(1);
  }

  const { data: results, pagination } = response;

  const evaluatorMap = new Map(evaluators.map((e) => [e.id, e]));

  const getEvaluatorName = (evaluatorId: string): string => {
    return evaluatorMap.get(evaluatorId)?.name || evaluatorId;
  };

  const getEvaluatorById = (evaluatorId: string): Evaluator | undefined => {
    return evaluatorMap.get(evaluatorId);
  };

  const evaluatorOptions = evaluators.map((e) => ({ id: e.id, name: e.name }));

  const agentOptions = (response.distinctAgentIds ?? []).map((id) => ({ id, name: id }));
  const availableOutputKeys = response.distinctOutputKeys ?? [];

  const pendingOnPage = results.filter((r) => r.output === null || r.output === undefined).length;

  return {
    filters,
    currentPage,
    setCurrentPage,
    response,
    results,
    pagination,
    isLoading,
    isRunning,
    pendingOnPage,
    pendingTotal,
    completedCount,
    hasComplexFilters,
    evaluatorOptions,
    agentOptions,
    availableOutputKeys,
    getEvaluatorName,
    getEvaluatorById,
    handleFiltersChange,
    fetchAllForExport: handleExportCsv,
    isExporting,
    exportError,
  };
}
