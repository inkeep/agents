'use client';

import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { EvaluationStatusBadge } from '@/components/evaluators/evaluation-status-badge';
import { EvaluatorViewDialog } from '@/components/evaluators/evaluator-view-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';
import type {
  EvaluationJobConfig,
  EvaluationJobFilterCriteria,
} from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationJobConfigEvaluators } from '@/lib/api/evaluation-job-configs';
import type { EvaluationResult } from '@/lib/api/evaluation-results';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import type { Evaluator } from '@/lib/api/evaluators';
import { filterEvaluationResults } from '@/lib/evaluation/filter-evaluation-results';
import { evaluatePassCriteria } from '@/lib/evaluation/pass-criteria-evaluator';
import { formatDateTimeTable } from '@/lib/utils/format-date';

type AnyRecord = Record<string, unknown>;
const isPlainObject = (v: unknown): v is AnyRecord =>
  v != null && typeof v === 'object' && !Array.isArray(v);

import {
  type EvaluationResultFilters,
  EvaluationResultsFilters,
} from './evaluation-results-filters';

interface EvaluationJobResultsProps {
  tenantId: string;
  projectId: string;
  jobConfig: EvaluationJobConfig;
  results: EvaluationResult[];
  evaluators: Evaluator[];
}

export function EvaluationJobResults({
  tenantId,
  projectId,
  jobConfig,
  results: initialResults,
  evaluators,
}: EvaluationJobResultsProps) {
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EvaluationResultFilters>({});
  const [results, setResults] = useState<EvaluationResult[]>(initialResults);
  const [progress, setProgress] = useState<{
    total: number;
    completed: number;
    isRunning: boolean;
  }>({ total: 0, completed: 0, isRunning: false });

  const loadProgress = useCallback(async () => {
    try {
      // Fetch latest results
      const latestResults = await fetchEvaluationResultsByJobConfig(
        tenantId,
        projectId,
        jobConfig.id
      );
      setResults(latestResults.data || []);

      // Get evaluator relations for this job
      const evaluatorRelations = await fetchEvaluationJobConfigEvaluators(
        tenantId,
        projectId,
        jobConfig.id
      );
      const evaluatorCount = evaluatorRelations.data?.length || 0;

      // Get conversation count from dataset run if available
      let conversationCount = 0;
      const criteria = jobConfig.jobFilters as EvaluationJobFilterCriteria;
      if (criteria?.datasetRunIds && criteria.datasetRunIds.length > 0) {
        try {
          const datasetRun = await fetchDatasetRun(tenantId, projectId, criteria.datasetRunIds[0]);
          conversationCount =
            datasetRun.data?.items?.reduce(
              (acc, item) => acc + (item.conversations?.length || 0),
              0
            ) || 0;
        } catch {
          // If we can't get dataset run, estimate from unique conversations in results
          const uniqueConversations = new Set(
            latestResults.data?.map((r) => r.conversationId) || []
          );
          conversationCount = uniqueConversations.size;
        }
      } else {
        // For non-dataset-run jobs, estimate from unique conversations
        const uniqueConversations = new Set(latestResults.data?.map((r) => r.conversationId) || []);
        conversationCount = uniqueConversations.size;
      }

      // Expected = conversations × evaluators
      const expectedTotal = conversationCount * evaluatorCount;
      // Only count results with output as completed
      const completedCount =
        latestResults.data?.filter((r) => r.output !== null && r.output !== undefined).length || 0;

      setProgress({
        total: expectedTotal,
        completed: completedCount,
        isRunning: completedCount < expectedTotal && expectedTotal > 0,
      });
    } catch (err) {
      console.error('Error loading evaluation progress:', err);
    }
  }, [tenantId, projectId, jobConfig.id, jobConfig.jobFilters]);

  // Initial progress load
  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // Auto-refresh when evaluations are in progress
  useEffect(() => {
    if (!progress.isRunning) return;

    const interval = setInterval(() => {
      loadProgress();
    }, 3000);

    return () => clearInterval(interval);
  }, [progress.isRunning, loadProgress]);

  const evaluatorMap = new Map<string, string>();
  evaluators.forEach((evaluator) => {
    evaluatorMap.set(evaluator.id, evaluator.name);
  });

  const getEvaluatorName = (evaluatorId: string): string => {
    return evaluatorMap.get(evaluatorId) || evaluatorId;
  };

  const getEvaluatorById = (evaluatorId: string): Evaluator | undefined => {
    return evaluators.find((e) => e.id === evaluatorId);
  };

  const selectedEvaluator = selectedEvaluatorId ? getEvaluatorById(selectedEvaluatorId) : undefined;

  const filteredResults = useMemo(
    () => filterEvaluationResults(results, filters, evaluators),
    [results, filters, evaluators]
  );

  const evaluatorOptions = evaluators.map((e) => ({ id: e.id, name: e.name }));
  const agentOptions = useMemo(() => {
    const uniqueAgents = new Map<string, string>();
    results.forEach((result) => {
      if (result.agentId && !uniqueAgents.has(result.agentId)) {
        uniqueAgents.set(result.agentId, result.agentId);
      }
    });
    return Array.from(uniqueAgents.entries()).map(([id, name]) => ({ id, name }));
  }, [results]);

  // Extract unique output schema keys from results for filtering dropdown
  const availableOutputKeys = useMemo(() => {
    const collect = (obj: unknown, prefix = ''): string[] => {
      if (!isPlainObject(obj)) return [];

      return Object.entries(obj).flatMap(([k, v]) => {
        const p = prefix ? `${prefix}.${k}` : k;
        if (Array.isArray(v)) {
          const first = v[0];
          return isPlainObject(first) ? [p, ...collect(first, p)] : [p];
        }
        return isPlainObject(v) ? [p, ...collect(v, p)] : [p];
      });
    };

    const keys = results.flatMap((r) => collect(r.output));
    return [...new Set(keys)].filter((key) => key.startsWith('output.')).sort();
  }, [results]);

  return (
    <div className="space-y-6">
      <EvaluationResultsFilters
        filters={filters}
        onFiltersChange={setFilters}
        evaluators={evaluatorOptions}
        agents={agentOptions}
        availableOutputKeys={availableOutputKeys}
      />

      {/* Progress indicator */}
      {progress.isRunning && (
        <div className="flex flex-col gap-3 p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Evaluation in progress</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {progress.completed} of {progress.total} evaluations completed
            </span>
            <Progress value={progress.completed} max={progress.total} className="h-1.5" />
          </div>
        </div>
      )}
      {!progress.isRunning && progress.total > 0 && progress.completed > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-green-600 dark:text-green-400">✓</span>
          Evaluation completed: {progress.completed} results
        </div>
      )}

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">
            Evaluation Results ({filteredResults.length} of {results.length})
          </h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {progress.isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for evaluation results...
              </span>
            ) : (
              'No evaluation results yet.'
            )}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No results match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow noHover>
                <TableHead>Input</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Evaluator</TableHead>
                <TableHead>Pass/Fail</TableHead>
                <TableHead>Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...filteredResults]
                .sort((a, b) => {
                  const aTime = a.conversationCreatedAt || a.createdAt;
                  const bTime = b.conversationCreatedAt || b.createdAt;
                  return new Date(bTime).getTime() - new Date(aTime).getTime();
                })
                .map((result) => (
                  <TableRow key={result.id} noHover>
                    <TableCell>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/traces/conversations/${result.conversationId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline max-w-md"
                      >
                        <span className="truncate">{result.input || result.conversationId}</span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {result.conversationCreatedAt
                        ? formatDateTimeTable(result.conversationCreatedAt, { local: true })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-muted-foreground">
                        {result.agentId || '-'}
                      </code>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setSelectedEvaluatorId(result.evaluatorId)}
                        className="inline-flex items-center bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/80 cursor-pointer transition-colors"
                      >
                        {getEvaluatorName(result.evaluatorId)}
                      </button>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const evaluator = getEvaluatorById(result.evaluatorId);
                        const resultData =
                          result.output && typeof result.output === 'object'
                            ? (result.output as Record<string, unknown>)
                            : {};
                        const outputData =
                          resultData.output && typeof resultData.output === 'object'
                            ? (resultData.output as Record<string, unknown>)
                            : resultData;
                        const evaluation = evaluatePassCriteria(
                          evaluator?.passCriteria,
                          outputData
                        );
                        return <EvaluationStatusBadge status={evaluation.status} />;
                      })()}
                    </TableCell>
                    <TableCell>
                      {result.output ? (
                        <div className="space-y-1">
                          {(() => {
                            const resultData =
                              result.output && typeof result.output === 'object'
                                ? (result.output as Record<string, unknown>)
                                : {};
                            const { metadata, ...outputWithoutMetadata } = resultData;

                            return (
                              <>
                                <OutputCollapsible
                                  resultId={result.id}
                                  output={outputWithoutMetadata}
                                />
                                {metadata && (
                                  <MetadataCollapsible resultId={result.id} metadata={metadata} />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No output</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedEvaluator && (
        <EvaluatorViewDialog
          evaluator={selectedEvaluator}
          isOpen={selectedEvaluator !== undefined}
          onOpenChange={(open) => !open && setSelectedEvaluatorId(null)}
        />
      )}
    </div>
  );
}

function OutputCollapsible({ resultId, output }: { resultId: string; output: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Output</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ExpandableJsonEditor
          name={`output-${resultId}`}
          value={JSON.stringify(output, null, 2)}
          label=""
          readOnly
          defaultOpen
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function MetadataCollapsible({ resultId, metadata }: { resultId: string; metadata: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Metadata</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ExpandableJsonEditor
          name={`metadata-${resultId}`}
          value={JSON.stringify(metadata, null, 2)}
          label=""
          readOnly
          defaultOpen
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
