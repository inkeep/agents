'use client';

import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { SuiteConfigViewDialog } from '@/components/evaluation-run-configs/suite-config-view-dialog';
import { EvaluationStatusBadge } from '@/components/evaluators/evaluation-status-badge';
import { EvaluatorViewDialog } from '@/components/evaluators/evaluator-view-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { EvaluationSuiteConfig } from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { evaluatePassCriteria } from '@/lib/evaluation/pass-criteria-evaluator';
import {
  type EvaluationResultFilters,
  EvaluationResultsFilters,
} from '../evaluation-jobs/evaluation-results-filters';
import { filterEvaluationResults } from '@/lib/evaluation/filter-evaluation-results';

interface EvaluationRunConfigResultsProps {
  tenantId: string;
  projectId: string;
  runConfig: EvaluationRunConfig;
  results: EvaluationResult[];
  evaluators: Evaluator[];
  suiteConfigs: EvaluationSuiteConfig[];
  suiteConfigEvaluators: Map<string, string[]>;
}

export function EvaluationRunConfigResults({
  tenantId,
  projectId,
  runConfig,
  results,
  evaluators,
  suiteConfigs,
  suiteConfigEvaluators,
}: EvaluationRunConfigResultsProps) {
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
  const [selectedSuiteConfigId, setSelectedSuiteConfigId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EvaluationResultFilters>({});

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

  const getSuiteConfigById = (suiteConfigId: string): EvaluationSuiteConfig | undefined => {
    return suiteConfigs.find((s) => s.id === suiteConfigId);
  };

  const selectedSuiteConfig = selectedSuiteConfigId
    ? getSuiteConfigById(selectedSuiteConfigId)
    : undefined;

  const runConfigSuiteConfigs = (runConfig.suiteConfigIds || [])
    .map((id) => getSuiteConfigById(id))
    .filter((config): config is EvaluationSuiteConfig => config !== undefined);

  const filteredResults = useMemo(
    () => filterEvaluationResults(results, filters, evaluators),
    [results, filters, evaluators]
  );

  const evaluatorOptions = evaluators.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-6">
      {/* Evaluation Plans Section */}
      {runConfigSuiteConfigs.length > 0 && (
        <div className="rounded-lg border">
          <div className="p-4">
            <div className="space-y-3">
              {runConfigSuiteConfigs.map((suiteConfig) => {
                const evaluatorIds = suiteConfigEvaluators.get(suiteConfig.id) || [];
                const evaluatorNames = evaluatorIds
                  .map((id) => getEvaluatorName(id))
                  .join(', ') || 'No evaluators';
                
                // Extract agent filter from filters
                const agentFilter = suiteConfig.filters?.agentId as string | undefined;

                return (
                  <div key={suiteConfig.id}>
                    <div className="font-medium text-sm">{evaluatorNames}</div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>
                        Sample Rate: {suiteConfig.sampleRate !== null ? `${(suiteConfig.sampleRate * 100).toFixed(0)}%` : 'N/A'}
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

      <EvaluationResultsFilters
        filters={filters}
        onFiltersChange={setFilters}
        evaluators={evaluatorOptions}
      />

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">
            Evaluation Results ({filteredResults.length} of {results.length})
          </h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No evaluation results yet.</p>
            <p className="text-xs mt-2">
              Results will appear here automatically when conversations complete and match the
              configured evaluation plans.
            </p>
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
                <TableHead>Agent</TableHead>
                <TableHead>Evaluator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...filteredResults]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((result) => (
                  <TableRow key={result.id} noHover>
                    <TableCell>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/traces/conversations/${result.conversationId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline max-w-md"
                      >
                        <span className="truncate">
                          {result.input || result.conversationId}
                        </span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      </Link>
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
                        const resultData = result.output && typeof result.output === 'object' 
                          ? result.output as Record<string, unknown>
                          : {};
                        const outputData = resultData.output && typeof resultData.output === 'object'
                          ? resultData.output as Record<string, unknown>
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
                            const resultData = result.output && typeof result.output === 'object' 
                              ? result.output as Record<string, unknown>
                              : {};
                            const { metadata, ...outputWithoutMetadata } = resultData;
                            
                            return (
                              <>
                                <OutputCollapsible
                                  resultId={result.id}
                                  output={outputWithoutMetadata}
                                />
                                {metadata && (
                                  <MetadataCollapsible
                                    resultId={result.id}
                                    metadata={metadata}
                                  />
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

      {selectedSuiteConfig && (
        <SuiteConfigViewDialog
          tenantId={tenantId}
          projectId={projectId}
          suiteConfigId={selectedSuiteConfig.id}
          isOpen={selectedSuiteConfig !== undefined}
          onOpenChange={(open) => !open && setSelectedSuiteConfigId(null)}
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
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>Output</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ExpandableJsonEditor
          name={`output-${resultId}`}
          value={JSON.stringify(output, null, 2)}
          label="Output"
          readOnly
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
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>Metadata</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ExpandableJsonEditor
          name={`metadata-${resultId}`}
          value={JSON.stringify(metadata, null, 2)}
          label="Metadata"
          readOnly
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
