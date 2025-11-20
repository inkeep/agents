'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDateTimeTable } from '@/app/utils/format-date';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { SuiteConfigViewDialog } from '@/components/evaluation-run-configs/suite-config-view-dialog';
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
import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { EvaluationSuiteConfig } from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { evaluatePassCriteria } from '@/lib/evaluation/pass-criteria-evaluator';

interface EvaluationRunConfigResultsProps {
  tenantId: string;
  projectId: string;
  runConfig: EvaluationRunConfig;
  results: EvaluationResult[];
  evaluators: Evaluator[];
  suiteConfigs: EvaluationSuiteConfig[];
}

export function EvaluationRunConfigResults({
  tenantId,
  projectId,
  runConfig,
  results,
  evaluators,
  suiteConfigs,
}: EvaluationRunConfigResultsProps) {
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
  const [selectedSuiteConfigId, setSelectedSuiteConfigId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-2">Run Config Configuration</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            <span className="font-medium">{runConfig.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Description: </span>
            <span>{runConfig.description || 'No description'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Status: </span>
            <span className={runConfig.isActive ? 'text-green-600' : 'text-muted-foreground'}>
              {runConfig.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Evaluation Plans: </span>
            <span>{runConfig.suiteConfigIds?.length || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Created: </span>
            {formatDateTimeTable(runConfig.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">Updated: </span>
            {formatDateTimeTable(runConfig.updatedAt)}
          </div>
        </div>
      </div>

      {/* Evaluation Plans Section */}
      {runConfigSuiteConfigs.length > 0 && (
        <div className="rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">
              Evaluation Plans ({runConfigSuiteConfigs.length})
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {runConfigSuiteConfigs.map((suiteConfig) => (
                <div
                  key={suiteConfig.id}
                  className="border rounded-md p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedSuiteConfigId(suiteConfig.id)}
                        className="text-left w-full"
                      >
                        <div className="font-medium text-sm">{suiteConfig.name}</div>
                        {suiteConfig.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {suiteConfig.description}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Evaluation Results ({results.length})</h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No evaluation results yet.</p>
            <p className="text-xs mt-2">
              Results will appear here automatically when conversations complete and match the
              configured evaluation plans.
            </p>
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

      {selectedSuiteConfig && (
        <SuiteConfigViewDialog
          tenantId={tenantId}
          projectId={projectId}
          suiteConfigId={selectedSuiteConfig.id}
          suiteConfigName={selectedSuiteConfig.name}
          isOpen={selectedSuiteConfig !== undefined}
          onOpenChange={(open) => !open && setSelectedSuiteConfigId(null)}
        />
      )}
    </div>
  );
}
