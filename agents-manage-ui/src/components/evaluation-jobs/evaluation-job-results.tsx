'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { EvaluationStatusBadge } from '@/components/evaluators/evaluation-status-badge';
import { EvaluatorViewDialog } from '@/components/evaluators/evaluator-view-dialog';
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-2">Batch Configuration</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">ID: </span>
            <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono">
              {jobConfig.id}
            </code>
          </div>
          <div>
            <span className="text-muted-foreground">Created: </span>
            {formatDateTimeTable(jobConfig.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">Updated: </span>
            {formatDateTimeTable(jobConfig.updatedAt)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Evaluation Results ({results.length})</h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No evaluation results yet. The batch evaluation may still be running.
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
              {[...results]
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
                        const outputData = result.output && typeof result.output === 'object' 
                          ? result.output as Record<string, unknown>
                          : {};
                        const evaluation = evaluatePassCriteria(
                          evaluator?.passCriteria,
                          outputData
                        );
                        return <EvaluationStatusBadge status={evaluation.status} />;
                      })()}
                    </TableCell>
                    <TableCell>
                      {result.output ? (
                        <ExpandableJsonEditor
                          name={`result-${result.id}`}
                          value={JSON.stringify(result.output, null, 2)}
                          onChange={() => {}}
                          label="Output"
                        />
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
