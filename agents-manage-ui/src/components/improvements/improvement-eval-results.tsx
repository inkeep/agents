'use client';

import { ArrowRight, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { EvaluationStatusBadge } from '@/components/evaluators/evaluation-status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { fetchImprovementEvalSummaryAction } from '@/lib/actions/improvements';
import type {
  EvalSummaryDatasetRun,
  EvalSummaryResponse,
  EvalSummaryResult,
} from '@/lib/api/improvements';
import type { EvaluationStatus } from '@/lib/evaluation/pass-criteria-evaluator';

interface ImprovementEvalResultsProps {
  tenantId: string;
  projectId: string;
  branchName: string;
  isRunning: boolean;
}

function toEvalStatus(passed: string): EvaluationStatus {
  if (passed === 'passed') return 'passed';
  if (passed === 'failed') return 'failed';
  return 'no_criteria';
}

function StatusBadge({ result }: { result?: EvalSummaryResult }) {
  if (!result) return <span className="text-xs text-muted-foreground">-</span>;
  if (result.passed === 'pending') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Running
      </Badge>
    );
  }
  return <EvaluationStatusBadge status={toEvalStatus(result.passed)} />;
}

function OutputCollapsible({ resultId, output, label }: { resultId: string; output: unknown; label?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!output) return <span className="text-xs text-muted-foreground">-</span>;

  const resultData = typeof output === 'object' ? (output as Record<string, unknown>) : {};
  const { metadata, ...outputWithoutMetadata } = resultData;

  return (
    <div className="space-y-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{label ?? 'Output'}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <ExpandableJsonEditor
            name={`output-${resultId}`}
            value={JSON.stringify(outputWithoutMetadata, null, 2)}
            label=""
            readOnly
            defaultOpen
          />
        </CollapsibleContent>
      </Collapsible>
      {metadata != null && (
        <MetadataCollapsible resultId={resultId} metadata={metadata} />
      )}
    </div>
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

interface AggregatedEvaluator {
  evaluatorId: string;
  evaluatorName: string;
  baselineResults: EvalSummaryResult[];
  postChangeResults: EvalSummaryResult[];
  baselinePassRate: string | null;
  postChangePassRate: string | null;
  overallStatus: 'passed' | 'failed' | 'no_criteria' | 'pending';
}

function computePassRate(results: EvalSummaryResult[]): string | null {
  const evaluated = results.filter((r) => r.passed === 'passed' || r.passed === 'failed');
  if (evaluated.length === 0) return null;
  const passed = evaluated.filter((r) => r.passed === 'passed').length;
  return `${passed}/${evaluated.length}`;
}

function computeOverallStatus(results: EvalSummaryResult[]): AggregatedEvaluator['overallStatus'] {
  if (results.some((r) => r.passed === 'pending')) return 'pending';
  const evaluated = results.filter((r) => r.passed === 'passed' || r.passed === 'failed');
  if (evaluated.length === 0) return 'no_criteria';
  return evaluated.every((r) => r.passed === 'passed') ? 'passed' : 'failed';
}

function aggregateByEvaluator(
  baselineResults: EvalSummaryResult[],
  postChangeResults: EvalSummaryResult[]
): AggregatedEvaluator[] {
  const evaluatorMap = new Map<string, AggregatedEvaluator>();

  for (const r of [...baselineResults, ...postChangeResults]) {
    if (!evaluatorMap.has(r.evaluatorId)) {
      evaluatorMap.set(r.evaluatorId, {
        evaluatorId: r.evaluatorId,
        evaluatorName: r.evaluatorName,
        baselineResults: [],
        postChangeResults: [],
        baselinePassRate: null,
        postChangePassRate: null,
        overallStatus: 'pending',
      });
    }
  }

  for (const r of baselineResults) {
    evaluatorMap.get(r.evaluatorId)!.baselineResults.push(r);
  }
  for (const r of postChangeResults) {
    evaluatorMap.get(r.evaluatorId)!.postChangeResults.push(r);
  }

  for (const agg of evaluatorMap.values()) {
    agg.baselinePassRate = computePassRate(agg.baselineResults);
    agg.postChangePassRate = computePassRate(agg.postChangeResults);
    const activeResults = agg.postChangeResults.length > 0 ? agg.postChangeResults : agg.baselineResults;
    agg.overallStatus = computeOverallStatus(activeResults);
  }

  return [...evaluatorMap.values()];
}

function ItemDetailRow({
  result,
  index,
  hasBaseline,
  baselineResult,
}: {
  result: EvalSummaryResult;
  index: number;
  hasBaseline: boolean;
  baselineResult?: EvalSummaryResult;
}) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell
        className="text-xs text-muted-foreground pl-8 max-w-[200px] truncate"
        title={result.input ?? `Item ${index + 1}`}
      >
        {result.input || `Item ${index + 1}`}
      </TableCell>
      {hasBaseline && (
        <>
          <TableCell><StatusBadge result={baselineResult} /></TableCell>
          <TableCell>
            {baselineResult ? (
              <OutputCollapsible resultId={`baseline-item-${baselineResult.id}`} output={baselineResult.output} />
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </TableCell>
        </>
      )}
      <TableCell><StatusBadge result={result} /></TableCell>
      <TableCell>
        <OutputCollapsible resultId={`post-item-${result.id}`} output={result.output} />
      </TableCell>
    </TableRow>
  );
}

function EvaluatorRow({ agg, hasBaseline }: { agg: AggregatedEvaluator; hasBaseline: boolean }) {
  const activeResults = agg.postChangeResults.length > 0 ? agg.postChangeResults : agg.baselineResults;
  const hasMultipleItems = activeResults.length > 1;
  const isSingleItem = activeResults.length === 1;
  const [expanded, setExpanded] = useState(false);

  const showBaseline = hasBaseline && agg.baselineResults.length > 0;
  const singlePost = isSingleItem ? activeResults[0] : undefined;
  const singleBaseline = isSingleItem && showBaseline ? agg.baselineResults[0] : undefined;

  return (
    <>
      <TableRow
        className={hasMultipleItems ? 'cursor-pointer hover:bg-muted/50' : ''}
        onClick={hasMultipleItems ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell className="text-xs font-medium">
          <div className="flex items-center gap-1">
            {hasMultipleItems && (
              expanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {agg.evaluatorName}
          </div>
        </TableCell>
        {hasBaseline && (
          <>
            <TableCell>
              {isSingleItem ? (
                <StatusBadge result={singleBaseline} />
              ) : agg.baselineResults.length > 0 ? (
                <span className="text-xs">
                  {agg.baselinePassRate ?? '-'}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {isSingleItem && singleBaseline ? (
                <OutputCollapsible resultId={`baseline-${singleBaseline.id}`} output={singleBaseline.output} />
              ) : hasMultipleItems ? (
                <span className="text-xs text-muted-foreground">
                  {agg.baselineResults.length} items
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
          </>
        )}
        <TableCell>
          {isSingleItem ? (
            <StatusBadge result={singlePost} />
          ) : agg.overallStatus === 'pending' ? (
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Running
            </Badge>
          ) : (
            <span className="text-xs">
              {agg.postChangePassRate ?? '-'}
            </span>
          )}
        </TableCell>
        <TableCell>
          {isSingleItem && singlePost ? (
            <OutputCollapsible resultId={`post-${singlePost.id}`} output={singlePost.output} />
          ) : hasMultipleItems ? (
            <span className="text-xs text-muted-foreground">
              {activeResults.length} items — click to expand
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && activeResults.map((result, i) => (
        <ItemDetailRow
          key={result.id}
          result={result}
          index={i}
          hasBaseline={showBaseline}
          baselineResult={agg.baselineResults[i]}
        />
      ))}
    </>
  );
}

function ComparisonTable({ group }: { group: DatasetGroup }) {
  const { baseline, postChange } = group;
  const postResults = postChange?.evaluationResults ?? [];
  const baselineResults = baseline?.evaluationResults ?? [];
  const hasBaseline = !!baseline;

  const aggregated = aggregateByEvaluator(baselineResults, postResults);

  if (aggregated.length === 0) return null;

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Evaluator</TableHead>
            {hasBaseline && (
              <>
                <TableHead className="text-xs">Baseline Status</TableHead>
                <TableHead className="text-xs">Baseline Output</TableHead>
              </>
            )}
            <TableHead className="text-xs">{hasBaseline ? 'Post-Change Status' : 'Status'}</TableHead>
            <TableHead className="text-xs">{hasBaseline ? 'Post-Change Output' : 'Output'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {aggregated.map((agg) => (
            <EvaluatorRow key={agg.evaluatorId} agg={agg} hasBaseline={hasBaseline} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DatasetRunProgress({ run }: { run: EvalSummaryDatasetRun }) {
  const progressPercent =
    run.items.total > 0 ? (run.items.completed / run.items.total) * 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {run.items.completed} of {run.items.total} items complete
          {run.items.running > 0 && `, ${run.items.running} running`}
          {run.items.pending > 0 && `, ${run.items.pending} pending`}
        </span>
        <span>{Math.round(progressPercent)}%</span>
      </div>
      <Progress value={progressPercent} className="h-2" />
    </div>
  );
}

interface DatasetGroup {
  datasetId: string;
  datasetName: string;
  baseline: EvalSummaryDatasetRun | null;
  postChange: EvalSummaryDatasetRun | null;
}

function DatasetGroupCard({ group }: { group: DatasetGroup }) {
  const [open, setOpen] = useState(true);
  const activeRun = group.postChange ?? group.baseline;
  if (!activeRun) return null;

  const hasBaseline = !!group.baseline;
  const hasBoth = !!group.baseline && !!group.postChange;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <CardTitle className="text-sm">{group.datasetName}</CardTitle>
                {hasBoth && (
                  <Badge variant="outline" className="text-xs gap-1">
                    Baseline <ArrowRight className="h-3 w-3" /> Post-Change
                  </Badge>
                )}
                {!hasBaseline && (
                  <Badge variant="secondary" className="text-xs">New</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeRun.items.total > 0 && (
                  <Badge
                    variant={activeRun.items.failed > 0 ? 'destructive' : 'default'}
                    className="text-xs"
                  >
                    {activeRun.items.completed}/{activeRun.items.total} complete
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <DatasetRunProgress run={activeRun} />
            <ComparisonTable group={group} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function buildDatasetGroups(runs: EvalSummaryDatasetRun[]): DatasetGroup[] {
  const groups = new Map<string, DatasetGroup>();

  for (const run of runs) {
    const existing = groups.get(run.datasetId) ?? {
      datasetId: run.datasetId,
      datasetName: run.datasetName,
      baseline: null,
      postChange: null,
    };

    if (run.phase === 'baseline') {
      existing.baseline = run;
    } else {
      existing.postChange = run;
    }

    groups.set(run.datasetId, existing);
  }

  return [...groups.values()];
}

export function ImprovementEvalResults({
  tenantId,
  projectId,
  branchName,
  isRunning,
}: ImprovementEvalResultsProps) {
  const [data, setData] = useState<EvalSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldPoll, setShouldPoll] = useState(isRunning);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchImprovementEvalSummaryAction(tenantId, projectId, branchName);
        if (cancelled) return;
        if (result.success && result.data) {
          setData(result.data);
          const hasIncomplete = result.data.datasetRuns.some(
            (run) => run.items.completed + run.items.failed < run.items.total ||
              run.evaluationResults.some((r) => r.passed === 'pending')
          );
          setShouldPoll(hasIncomplete);
        }
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    if (shouldPoll) {
      const interval = setInterval(load, 8_000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, branchName, shouldPoll]);

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading evaluation results...
        </CardContent>
      </Card>
    );
  }

  if (!data || data.datasetRuns.length === 0) {
    if (isRunning) {
      return (
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for evaluation runs...
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const groups = buildDatasetGroups(data.datasetRuns);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Evaluation Results</h3>
      {groups.map((group) => (
        <DatasetGroupCard key={group.datasetId} group={group} />
      ))}
    </div>
  );
}
