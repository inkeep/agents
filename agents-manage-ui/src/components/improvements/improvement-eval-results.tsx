'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
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

function OutputCollapsible({
  resultId,
  output,
  label,
}: {
  resultId: string;
  output: unknown;
  label?: string;
}) {
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
      {metadata != null && <MetadataCollapsible resultId={resultId} metadata={metadata} />}
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
    const agg = evaluatorMap.get(r.evaluatorId);
    if (agg) agg.baselineResults.push(r);
  }
  for (const r of postChangeResults) {
    const agg = evaluatorMap.get(r.evaluatorId);
    if (agg) agg.postChangeResults.push(r);
  }

  for (const agg of evaluatorMap.values()) {
    agg.baselinePassRate = computePassRate(agg.baselineResults);
    agg.postChangePassRate = computePassRate(agg.postChangeResults);
    const activeResults =
      agg.postChangeResults.length > 0 ? agg.postChangeResults : agg.baselineResults;
    agg.overallStatus = computeOverallStatus(activeResults);
  }

  return [...evaluatorMap.values()];
}

type ChangeKind = 'improved' | 'regressed' | 'unchanged' | 'new' | 'pending';

function countPassed(results: EvalSummaryResult[]): number {
  return results.filter((r) => r.passed === 'passed').length;
}

function classifyEvaluator(agg: AggregatedEvaluator, hasBaseline: boolean): ChangeKind {
  if (agg.overallStatus === 'pending') return 'pending';
  if (!hasBaseline || agg.baselineResults.length === 0) {
    if (agg.overallStatus === 'passed') return 'improved';
    if (agg.overallStatus === 'failed') return 'regressed';
    return 'new';
  }
  const baselinePassed = countPassed(agg.baselineResults);
  const postPassed = countPassed(agg.postChangeResults);
  if (postPassed > baselinePassed) return 'improved';
  if (postPassed < baselinePassed) return 'regressed';
  return 'unchanged';
}

function classifyItem(
  result: EvalSummaryResult,
  baselineResult: EvalSummaryResult | undefined
): ChangeKind {
  if (result.passed === 'pending' || baselineResult?.passed === 'pending') return 'pending';
  if (!baselineResult) {
    if (result.passed === 'passed') return 'improved';
    if (result.passed === 'failed') return 'regressed';
    return 'new';
  }
  const basePassed = baselineResult.passed === 'passed';
  const postPassed = result.passed === 'passed';
  if (basePassed === postPassed) return 'unchanged';
  return postPassed ? 'improved' : 'regressed';
}

const CHANGE_CONFIG: Record<
  Exclude<ChangeKind, 'pending'>,
  {
    label: string;
    icon: typeof TrendingUp;
    className: string;
  }
> = {
  improved: {
    label: 'Improved',
    icon: TrendingUp,
    className:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900',
  },
  regressed: {
    label: 'Regressed',
    icon: TrendingDown,
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  },
  unchanged: {
    label: 'Unchanged',
    icon: Minus,
    className: 'bg-muted text-muted-foreground border-border',
  },
  new: {
    label: 'New',
    icon: Sparkles,
    className:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  },
};

function ChangeBadge({ kind }: { kind: ChangeKind }) {
  if (kind === 'pending') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Pending
      </Badge>
    );
  }
  const config = CHANGE_CONFIG[kind];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 font-medium ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ChangeIcon({ kind }: { kind: ChangeKind }) {
  if (kind === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Pending
      </span>
    );
  }
  const config = CHANGE_CONFIG[kind];
  const Icon = config.icon;
  const colorClass =
    kind === 'improved'
      ? 'text-green-600 dark:text-green-400'
      : kind === 'regressed'
        ? 'text-red-600 dark:text-red-400'
        : kind === 'new'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

interface ChangeCounts {
  improved: number;
  regressed: number;
  unchanged: number;
  new: number;
  pending: number;
}

function ChangeSummaryBanner({ counts }: { counts: ChangeCounts }) {
  const hasRegressions = counts.regressed > 0;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 ${
        hasRegressions
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : 'border-border bg-muted/30'
      }`}
    >
      <SummaryStat kind="improved" count={counts.improved} />
      <SummaryStat kind="regressed" count={counts.regressed} />
      {counts.unchanged > 0 && <SummaryStat kind="unchanged" count={counts.unchanged} />}
      {counts.new > 0 && <SummaryStat kind="new" count={counts.new} />}
      {counts.pending > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {counts.pending} pending
        </span>
      )}
      {hasRegressions && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Review regressions before merging
        </span>
      )}
    </div>
  );
}

function SummaryStat({ kind, count }: { kind: Exclude<ChangeKind, 'pending'>; count: number }) {
  const config = CHANGE_CONFIG[kind];
  const Icon = config.icon;
  const iconColor =
    kind === 'improved'
      ? 'text-green-600 dark:text-green-400'
      : kind === 'regressed'
        ? 'text-red-600 dark:text-red-400'
        : kind === 'new'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      <span className="font-medium">{count}</span>
      <span className="text-muted-foreground">{config.label}</span>
    </span>
  );
}

function computeChangeCounts(
  aggregated: AggregatedEvaluator[],
  hasBaseline: boolean
): ChangeCounts {
  const counts: ChangeCounts = {
    improved: 0,
    regressed: 0,
    unchanged: 0,
    new: 0,
    pending: 0,
  };
  for (const agg of aggregated) {
    const kind = classifyEvaluator(agg, hasBaseline);
    counts[kind] += 1;
  }
  return counts;
}

function emptyChangeCounts(): ChangeCounts {
  return { improved: 0, regressed: 0, unchanged: 0, new: 0, pending: 0 };
}

function addChangeCounts(a: ChangeCounts, b: ChangeCounts): ChangeCounts {
  return {
    improved: a.improved + b.improved,
    regressed: a.regressed + b.regressed,
    unchanged: a.unchanged + b.unchanged,
    new: a.new + b.new,
    pending: a.pending + b.pending,
  };
}

function datasetGroupChangeCounts(group: DatasetGroup): ChangeCounts {
  const postResults = group.postChange?.evaluationResults ?? [];
  const baselineResults = group.baseline?.evaluationResults ?? [];
  const aggregated = aggregateByEvaluator(baselineResults, postResults);
  return computeChangeCounts(aggregated, !!group.baseline);
}

function OverallStatusBanner({ counts }: { counts: ChangeCounts }) {
  const total = counts.improved + counts.regressed + counts.unchanged + counts.new + counts.pending;
  if (total === 0) return null;

  if (counts.regressed > 0) {
    const word = counts.regressed === 1 ? 'regression' : 'regressions';
    return (
      <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-red-900 dark:text-red-200">
            {counts.regressed} {word} detected — review before merging
          </div>
          <div className="text-xs text-red-700 dark:text-red-300 mt-0.5">
            {counts.improved > 0 && `${counts.improved} improved · `}
            {counts.unchanged > 0 && `${counts.unchanged} unchanged · `}
            {counts.new > 0 && `${counts.new} new · `}
            {counts.regressed} regressed
          </div>
        </div>
      </div>
    );
  }

  if (counts.pending > 0 && counts.improved === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
        <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          Evaluation in progress — {counts.pending} pending
        </div>
      </div>
    );
  }

  if (counts.improved > 0) {
    const word = counts.improved === 1 ? 'improvement' : 'improvements';
    return (
      <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/30">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-green-900 dark:text-green-200">
            No regressions — {counts.improved} {word} detected
          </div>
          <div className="text-xs text-green-700 dark:text-green-300 mt-0.5">
            {counts.unchanged > 0 && ` ${counts.unchanged} unchanged`}
            {counts.new > 0 && ` ${counts.new} new`}
            {counts.pending > 0 && ` ${counts.pending} pending`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
      <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <div className="text-sm text-muted-foreground">No regressions — all tests unchanged</div>
    </div>
  );
}

function ItemDetailRow({
  result,
  index,
  hasBaseline,
  baselineResult,
  tenantId,
  projectId,
}: {
  result: EvalSummaryResult;
  index: number;
  hasBaseline: boolean;
  baselineResult?: EvalSummaryResult;
  tenantId: string;
  projectId: string;
}) {
  const traceHref = (conversationId: string) =>
    `/${tenantId}/projects/${projectId}/traces/conversations/${conversationId}`;
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
          <TableCell>
            <div className="flex items-center gap-2">
              <StatusBadge result={baselineResult} />
              {baselineResult?.conversationId && (
                <TraceLink href={traceHref(baselineResult.conversationId)} />
              )}
            </div>
          </TableCell>
          <TableCell>
            {baselineResult ? (
              <OutputCollapsible
                resultId={`baseline-item-${baselineResult.id}`}
                output={baselineResult.output}
              />
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </TableCell>
        </>
      )}
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusBadge result={result} />
          {result.conversationId && <TraceLink href={traceHref(result.conversationId)} />}
        </div>
      </TableCell>
      <TableCell>
        <OutputCollapsible resultId={`post-item-${result.id}`} output={result.output} />
      </TableCell>
      <TableCell>
        <ChangeIcon kind={classifyItem(result, baselineResult)} />
      </TableCell>
    </TableRow>
  );
}

function TraceLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1 transition-colors"
      title="View trace"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3" />
      View trace
    </Link>
  );
}

function EvaluatorRow({
  agg,
  hasBaseline,
  tenantId,
  projectId,
}: {
  agg: AggregatedEvaluator;
  hasBaseline: boolean;
  tenantId: string;
  projectId: string;
}) {
  const activeResults =
    agg.postChangeResults.length > 0 ? agg.postChangeResults : agg.baselineResults;
  const hasItems = activeResults.length > 0;
  const [expanded, setExpanded] = useState(false);

  const showBaseline = hasBaseline && agg.baselineResults.length > 0;

  return (
    <>
      <TableRow
        className={hasItems ? 'cursor-pointer hover:bg-muted/50' : ''}
        onClick={hasItems ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell className="text-xs font-medium">
          <div className="flex items-center gap-1">
            {hasItems &&
              (expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              ))}
            {agg.evaluatorName}
          </div>
        </TableCell>
        {hasBaseline && (
          <>
            <TableCell>
              {agg.baselineResults.length > 0 ? (
                <span className="text-xs">{agg.baselinePassRate ?? '-'}</span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {hasItems ? (
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
          {agg.overallStatus === 'pending' ? (
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Running
            </Badge>
          ) : (
            <span className="text-xs">{agg.postChangePassRate ?? '-'}</span>
          )}
        </TableCell>
        <TableCell>
          {hasItems ? (
            <span className="text-xs text-muted-foreground">
              {activeResults.length} {activeResults.length === 1 ? 'item' : 'items'}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          <ChangeBadge kind={classifyEvaluator(agg, hasBaseline)} />
        </TableCell>
      </TableRow>
      {expanded &&
        activeResults.map((result, i) => (
          <ItemDetailRow
            key={result.id}
            result={result}
            index={i}
            hasBaseline={showBaseline}
            baselineResult={agg.baselineResults[i]}
            tenantId={tenantId}
            projectId={projectId}
          />
        ))}
    </>
  );
}

function ComparisonTable({
  group,
  tenantId,
  projectId,
}: {
  group: DatasetGroup;
  tenantId: string;
  projectId: string;
}) {
  const { baseline, postChange } = group;
  const postResults = postChange?.evaluationResults ?? [];
  const baselineResults = baseline?.evaluationResults ?? [];
  const hasBaseline = !!baseline;

  const aggregated = aggregateByEvaluator(baselineResults, postResults);

  if (aggregated.length === 0) return null;

  const counts = computeChangeCounts(aggregated, hasBaseline);

  return (
    <div className="space-y-3">
      <ChangeSummaryBanner counts={counts} />
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
              <TableHead className="text-xs">
                {hasBaseline ? 'Post-Change Status' : 'Status'}
              </TableHead>
              <TableHead className="text-xs">
                {hasBaseline ? 'Post-Change Output' : 'Output'}
              </TableHead>
              <TableHead className="text-xs">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregated.map((agg) => (
              <EvaluatorRow
                key={agg.evaluatorId}
                agg={agg}
                hasBaseline={hasBaseline}
                tenantId={tenantId}
                projectId={projectId}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DatasetRunProgress({ run }: { run: EvalSummaryDatasetRun }) {
  const progressPercent = run.items.total > 0 ? (run.items.completed / run.items.total) * 100 : 0;

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

function DatasetGroupCard({
  group,
  tenantId,
  projectId,
}: {
  group: DatasetGroup;
  tenantId: string;
  projectId: string;
}) {
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
                  <Badge variant="secondary" className="text-xs">
                    New
                  </Badge>
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
            <ComparisonTable group={group} tenantId={tenantId} projectId={projectId} />
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
            (run) =>
              run.items.completed + run.items.failed < run.items.total ||
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
  const overallCounts = groups.reduce(
    (acc, group) => addChangeCounts(acc, datasetGroupChangeCounts(group)),
    emptyChangeCounts()
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Evaluation Results</h3>
      <OverallStatusBanner counts={overallCounts} />
      {groups.map((group) => (
        <DatasetGroupCard
          key={group.datasetId}
          group={group}
          tenantId={tenantId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}
