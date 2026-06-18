'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ReadOnlyJsonView } from '@/components/editors/read-only-json-view';
import { SuiteConfigViewDialog } from '@/components/evaluation-run-configs/suite-config-view-dialog';
import { EvaluationStatusBadge } from '@/components/evaluators/evaluation-status-badge';
import { EvaluatorViewDialog } from '@/components/evaluators/evaluator-view-dialog';
import { Button } from '@/components/ui/button';
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
import { usePaginatedEvalResults } from '@/hooks/use-paginated-eval-results';
import type { PaginatedEvalResultsResponse } from '@/lib/api/evaluation-results';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { EvaluationSuiteConfig } from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { exportEvaluationResultsCsv } from '@/lib/csv/export-csv';
import { getEvaluationStatus } from '@/lib/evaluation/pass-criteria-evaluator';
import { formatDateTimeTable } from '@/lib/utils/format-date';

import { EvaluationResultsFilters } from '../evaluation-jobs/evaluation-results-filters';

interface EvaluationRunConfigResultsProps {
  tenantId: string;
  projectId: string;
  runConfig: EvaluationRunConfig;
  initialResponse: PaginatedEvalResultsResponse;
  evaluators: Evaluator[];
  suiteConfigs: EvaluationSuiteConfig[];
  suiteConfigEvaluators: Map<string, string[]>;
}

export function EvaluationRunConfigResults({
  tenantId,
  projectId,
  runConfig,
  initialResponse,
  evaluators,
  suiteConfigs,
  suiteConfigEvaluators,
}: EvaluationRunConfigResultsProps) {
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
  const [selectedSuiteConfigId, setSelectedSuiteConfigId] = useState<string | null>(null);

  const {
    filters,
    currentPage,
    setCurrentPage,
    results,
    pagination,
    isLoading,
    isRunning,
    pendingTotal,
    completedCount,
    evaluatorOptions,
    agentOptions,
    availableOutputKeys,
    getEvaluatorName,
    getEvaluatorById,
    handleFiltersChange,
    fetchAllForExport,
    isExporting,
    exportError,
  } = usePaginatedEvalResults({
    tenantId,
    projectId,
    kind: 'run-config',
    configId: runConfig.id,
    initialResponse,
    evaluators,
    pollIntervalMs: 5000,
  });

  const selectedEvaluator = selectedEvaluatorId ? getEvaluatorById(selectedEvaluatorId) : undefined;

  const getSuiteConfigById = (suiteConfigId: string): EvaluationSuiteConfig | undefined => {
    return suiteConfigs.find((s) => s.id === suiteConfigId);
  };

  const selectedSuiteConfig = selectedSuiteConfigId
    ? getSuiteConfigById(selectedSuiteConfigId)
    : undefined;

  const runConfigSuiteConfigs = (runConfig.suiteConfigIds || [])
    .map((id) => getSuiteConfigById(id))
    .filter((config) => config !== undefined);

  async function handleExportCsv() {
    const exportData = await fetchAllForExport();
    if (!exportData) return;
    exportEvaluationResultsCsv({
      results: exportData,
      getEvaluatorName,
      getEvaluatorById,
      filename: `evaluation-run-config-results-${runConfig.id.slice(0, 8)}.csv`,
    });
  }

  return (
    <div className="space-y-6">
      {runConfigSuiteConfigs.length > 0 && (
        <div className="rounded-lg border">
          <div className="p-4">
            <div className="space-y-3">
              {runConfigSuiteConfigs.map((suiteConfig) => {
                const evaluatorIds = suiteConfigEvaluators.get(suiteConfig.id) || [];
                const evaluatorNames =
                  evaluatorIds.map((id) => getEvaluatorName(id)).join(', ') || 'No evaluators';

                const agentFilter = suiteConfig.filters?.agentId as string | undefined;

                return (
                  <div key={suiteConfig.id}>
                    <div className="font-medium text-sm">{evaluatorNames}</div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>
                        Sample Rate:{' '}
                        {suiteConfig.sampleRate !== null
                          ? `${(suiteConfig.sampleRate * 100).toFixed(0)}%`
                          : '100%'}
                      </div>
                      {agentFilter && (
                        <div>
                          Agent Filter: <code className="text-xs">{agentFilter}</code>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {pagination.total > 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            )}
            <span className="text-sm text-muted-foreground">
              {completedCount} of {pagination.total} evaluations completed
              {isRunning ? ` (${pendingTotal} pending)` : ''}
            </span>
          </div>
          {isRunning && (
            <Progress value={completedCount} max={pagination.total} className="h-1.5" />
          )}
        </div>
      )}

      <EvaluationResultsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        evaluators={evaluatorOptions}
        agents={agentOptions}
        availableOutputKeys={availableOutputKeys}
      />

      <div className="rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Evaluation Results ({pagination.total})</h3>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            {exportError && <span className="text-xs text-destructive">{exportError}</span>}
            {results.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            )}
          </div>
        </div>
        {pagination.total === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {filters.evaluatorId ||
            filters.agentId ||
            filters.searchInput ||
            (filters.status && filters.status !== 'all') ? (
              <p>No results match the current filters.</p>
            ) : (
              <>
                <p>No evaluation results yet.</p>
                <p className="text-xs mt-2">
                  Results will appear here automatically when conversations complete and match the
                  configured evaluation plans.
                </p>
              </>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow noHover>
                <TableHead>Input</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Evaluator</TableHead>
                <TableHead>PASS/FAIL</TableHead>
                <TableHead>Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
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
                    <EvaluationStatusBadge
                      status={getEvaluationStatus(result, getEvaluatorById(result.evaluatorId))}
                    />
                  </TableCell>
                  <TableCell>
                    {result.output ? (
                      <OutputCell output={result.output} />
                    ) : (
                      <span className="text-sm text-muted-foreground">No output</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={currentPage === pagination.pages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedEvaluator && (
        <EvaluatorViewDialog
          tenantId={tenantId}
          projectId={projectId}
          evaluator={selectedEvaluator}
          isOpen={selectedEvaluator !== undefined}
          onOpenChange={(open) => !open && setSelectedEvaluatorId(null)}
        />
      )}

      {selectedSuiteConfig && (
        <SuiteConfigViewDialog
          suiteConfigId={selectedSuiteConfig.id}
          isOpen={selectedSuiteConfig !== undefined}
          onOpenChange={(open) => !open && setSelectedSuiteConfigId(null)}
        />
      )}
    </div>
  );
}

function OutputCell({ output }: { output: Record<string, unknown> }) {
  const { metadata, ...outputWithoutMetadata } = output;
  return (
    <div className="space-y-1">
      <OutputCollapsible output={outputWithoutMetadata} />
      {metadata != null && <MetadataCollapsible metadata={metadata} />}
    </div>
  );
}

function OutputCollapsible({ output }: { output: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Output</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ReadOnlyJsonView value={JSON.stringify(output, null, 2)} maxHeight="300px" />
      </CollapsibleContent>
    </Collapsible>
  );
}

function MetadataCollapsible({ metadata }: { metadata: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Metadata</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ReadOnlyJsonView value={JSON.stringify(metadata, null, 2)} maxHeight="300px" />
      </CollapsibleContent>
    </Collapsible>
  );
}
