'use client';

import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
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
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { Evaluator } from '@/lib/api/evaluators';
import { evaluatePassCriteria } from '@/lib/evaluation/pass-criteria-evaluator';
import {
  type EvaluationResultFilters,
  EvaluationResultsFilters,
} from './evaluation-results-filters';
import { filterEvaluationResults } from '@/lib/evaluation/filter-evaluation-results';

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
  results,
  evaluators,
}: EvaluationJobResultsProps) {
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
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

  const filteredResults = useMemo(
    () => filterEvaluationResults(results, filters, evaluators),
    [results, filters, evaluators]
  );

  const evaluatorOptions = evaluators.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-6">
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
            No evaluation results yet. The batch evaluation may still be running.
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
                <TableHead>Evaluator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Created</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeTable(result.createdAt)}
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
          onChange={() => {}}
          label="Output"
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
          onChange={() => {}}
          label="Metadata"
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
