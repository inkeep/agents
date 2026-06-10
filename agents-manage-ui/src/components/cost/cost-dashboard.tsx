'use client';

import { Coins, Database, ExternalLink, FlaskConical, Hash } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isEvalGenerationType } from '@/constants/signoz';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjectsWithAgents } from '@/lib/api/projects';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';
import { formatDateAgo } from '@/lib/utils/format-date';

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

interface AgentInfo {
  name: string;
  projectId: string;
}

function AgentLabel({
  agentId,
  tenantId,
  agentsById,
}: {
  agentId: string;
  tenantId: string;
  agentsById: Map<string, AgentInfo>;
}): ReactNode {
  if (!agentId) return '—';
  const info = agentsById.get(agentId);
  const label = info ? `${info.name} (${agentId})` : agentId;
  if (!info?.projectId) return label;
  return (
    <Link
      href={`/${tenantId}/projects/${info.projectId}/cost`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {label}
    </Link>
  );
}

interface CostDashboardProps {
  tenantId: string;
  projectId?: string;
  agentId?: string;
  startTime: string;
  endTime: string;
}

interface UsageSummaryRow {
  groupKey: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  eventCount: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

interface EvalSummary {
  totalCost: number;
  totalTokens: number;
  evalCallCount: number;
  conversationsEvaluated: number;
}

const EMPTY_EVAL_SUMMARY: EvalSummary = {
  totalCost: 0,
  totalTokens: 0,
  evalCallCount: 0,
  conversationsEvaluated: 0,
};

// "Cost by Cache Participation" is derived CLIENT-SIDE from the existing summaryByType data
// (option ii spirit per US-013 AC2, executed client-side to avoid a second SigNoz round-trip).
// Each generation_type bucket is classified by its aggregate cache token columns from US-011:
//   Cached    — at least some calls in this generation_type hit the cache (totalCacheReadTokens > 0)
//   Cache writes — wrote to cache but no reads in window (potential cache regression area)
//   Uncached  — no cache participation at all (legacy spans / non-eligible types / NOT-SUPPORTED)
// The full per-call derivation (HIT / MISS / NOT-ATTEMPTED / NOT-SUPPORTED-BY-PROVIDER) is reserved
// for the per-call timeline badge (US-012) + debug CLI (US-014) per D8/D11.
export type CacheParticipationBucket = 'Cached' | 'Cache writes' | 'Uncached';

const CACHE_PARTICIPATION_ORDER: readonly CacheParticipationBucket[] = [
  'Cached',
  'Cache writes',
  'Uncached',
] as const;

function classifyByCacheParticipation(row: UsageSummaryRow): CacheParticipationBucket {
  if (row.totalCacheReadTokens > 0) return 'Cached';
  if (row.totalCacheCreationTokens > 0) return 'Cache writes';
  return 'Uncached';
}

export function bucketByCacheParticipation(byType: UsageSummaryRow[]): UsageSummaryRow[] {
  const buckets = new Map<CacheParticipationBucket, UsageSummaryRow>();
  for (const state of CACHE_PARTICIPATION_ORDER) {
    buckets.set(state, {
      groupKey: state,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalEstimatedCostUsd: 0,
      eventCount: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    });
  }
  for (const row of byType) {
    const bucket = buckets.get(classifyByCacheParticipation(row));
    if (!bucket) continue;
    bucket.totalInputTokens += row.totalInputTokens;
    bucket.totalOutputTokens += row.totalOutputTokens;
    bucket.totalTokens += row.totalTokens;
    bucket.totalEstimatedCostUsd += row.totalEstimatedCostUsd;
    bucket.eventCount += row.eventCount;
    bucket.totalCacheReadTokens += row.totalCacheReadTokens;
    bucket.totalCacheCreationTokens += row.totalCacheCreationTokens;
  }
  return CACHE_PARTICIPATION_ORDER.map((state) => buckets.get(state)).filter(
    (row): row is UsageSummaryRow => row != null && row.eventCount > 0
  );
}

export type StatScope = 'total' | 'per-conversation' | 'per-message';

export function CostDashboard({
  tenantId,
  projectId,
  startTime,
  endTime,
  agentId,
}: CostDashboardProps) {
  const [scope, setScope] = useState<StatScope>('total');
  const [summaryByModel, setSummaryByModel] = useState<UsageSummaryRow[]>([]);
  const [summaryByAgent, setSummaryByAgent] = useState<UsageSummaryRow[]>([]);
  const [summaryByType, setSummaryByType] = useState<UsageSummaryRow[]>([]);
  const [summaryByProvider, setSummaryByProvider] = useState<UsageSummaryRow[]>([]);
  const [evalSummary, setEvalSummary] = useState<EvalSummary>(EMPTY_EVAL_SUMMARY);
  const [summariesLoading, setSummariesLoading] = useState(true);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  const [events, setEvents] = useState<SigNozUsageEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [userMessageCount, setUserMessageCount] = useState(0);
  const [conversationCount, setConversationCount] = useState(0);

  const [chartData, setChartData] = useState<Array<{ date: string; cost: number }>>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const [agentsById, setAgentsById] = useState<Map<string, AgentInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function loadAgentNames() {
      const map = new Map<string, AgentInfo>();
      try {
        if (projectId) {
          const { data } = await fetchAgents(tenantId, projectId);
          for (const agent of data) {
            map.set(agent.id, { name: agent.name, projectId });
          }
        } else {
          const { data: projects } = await fetchProjectsWithAgents(tenantId);
          for (const project of projects) {
            for (const agent of project.agents) {
              map.set(agent.agentId, { name: agent.agentName, projectId: project.id });
            }
          }
        }
      } catch (e) {
        console.warn('[CostDashboard] Failed to load agent names:', e);
      }
      if (!cancelled) setAgentsById(map);
    }

    loadAgentNames();
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId]);

  useEffect(() => {
    let cancelled = false;
    setSummariesLoading(true);
    setSummariesError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const client = getSigNozStatsClient(tenantId);
    Promise.all([
      client.getUsageCostSummaries(
        start,
        end,
        ['model', 'agent', 'generation_type', 'provider'] as const,
        projectId,
        agentId
      ),
      client.getUsageCounts(start, end, projectId, agentId),
      client.getEvalUsageSummary(start, end, projectId, agentId).catch((e) => {
        console.warn('[CostDashboard] Eval summary failed, hiding eval card:', e);
        return EMPTY_EVAL_SUMMARY;
      }),
    ])
      .then(([summaries, counts, evals]) => {
        if (cancelled) return;
        setSummaryByModel(summaries.model);
        setSummaryByAgent(summaries.agent);
        setSummaryByType(summaries.generation_type);
        setSummaryByProvider(summaries.provider);
        setUserMessageCount(counts.messageCount);
        setConversationCount(counts.conversationCount);
        setEvalSummary(evals);
      })
      .catch(() => {
        if (cancelled) return;
        setSummariesError(
          'Failed to load cost data. Try refreshing or selecting a different time range.'
        );
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, agentId, startTime, endTime]);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    getSigNozStatsClient(tenantId)
      .getUsageEventsList(start, end, { projectId, agentId, limit: 200 })
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setEventsError(
          'Failed to load cost events. Try refreshing or selecting a different time range.'
        );
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, agentId, startTime, endTime]);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    getSigNozStatsClient(tenantId)
      .getUsageCostPerDay(start, end, projectId, agentId)
      .then((data) => {
        if (cancelled) return;
        setChartData(data);
      })
      .catch(() => {
        if (cancelled) return;
        setChartError(
          'Failed to load cost chart. Try refreshing or selecting a different time range.'
        );
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, agentId, startTime, endTime]);

  const totals = summaryByModel.reduce(
    (acc, row) => ({
      totalTokens: acc.totalTokens + row.totalTokens,
      totalInputTokens: acc.totalInputTokens + row.totalInputTokens,
      totalOutputTokens: acc.totalOutputTokens + row.totalOutputTokens,
      totalCost: acc.totalCost + row.totalEstimatedCostUsd,
      totalEvents: acc.totalEvents + row.eventCount,
      totalCacheReadTokens: acc.totalCacheReadTokens + row.totalCacheReadTokens,
      totalCacheCreationTokens: acc.totalCacheCreationTokens + row.totalCacheCreationTokens,
    }),
    {
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalEvents: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    }
  );

  const scopeDivisor =
    scope === 'per-conversation'
      ? conversationCount || 1
      : scope === 'per-message'
        ? userMessageCount || 1
        : 1;

  return (
    <>
      <UsageStatCards
        totals={totals}
        conversationCount={conversationCount}
        messageCount={userMessageCount}
        isLoading={summariesLoading}
        error={summariesError}
        scope={scope}
        onScopeChange={setScope}
      />

      <span className="text-sm font-medium text-muted-foreground">Cost Breakdown</span>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <UsageBreakdownTable
          title="Cost by Model"
          data={summaryByModel}
          isLoading={summariesLoading}
          error={summariesError}
          divisor={scopeDivisor}
        />
        <UsageBreakdownTable
          title="Cost by Agent"
          data={summaryByAgent}
          isLoading={summariesLoading}
          error={summariesError}
          groupLabel="Agent"
          formatGroupKey={(agentId) => (
            <AgentLabel agentId={agentId} tenantId={tenantId} agentsById={agentsById} />
          )}
          divisor={scopeDivisor}
        />
        <UsageBreakdownTable
          title="Cost by Provider"
          data={summaryByProvider}
          isLoading={summariesLoading}
          error={summariesError}
          groupLabel="Provider"
          divisor={scopeDivisor}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="min-h-0">
          {chartError ? (
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Cost Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-600 dark:text-red-400">{chartError}</p>
              </CardContent>
            </Card>
          ) : (
            (chartLoading || chartData.length > 0) && (
              <AreaChartCard
                title="Cost Over Time"
                className="h-full"
                chartContainerClassName="h-full min-h-[300px] w-full"
                config={{ cost: { color: 'var(--chart-2)', label: 'Cost (USD)' } }}
                data={chartData}
                dataKeyOne="cost"
                xAxisDataKey="date"
                isLoading={chartLoading}
                tickFormatter={(value: string) => {
                  try {
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) {
                      const [y, m, d] = value.split('-').map(Number);
                      return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                    }
                    return date.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                  } catch {
                    return value;
                  }
                }}
                yAxisTickFormatter={(value: number | string) => {
                  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
                  return num < 0.01 ? `$${num.toFixed(4)}` : `$${num.toFixed(2)}`;
                }}
              />
            )
          )}
        </div>
        <div>
          <UsageEventsTable
            tenantId={tenantId}
            projectId={projectId}
            events={events}
            isLoading={eventsLoading}
            error={eventsError}
            agentsById={agentsById}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {evalSummary.conversationsEvaluated > 0 && (
          <EvalCostCard evalSummary={evalSummary} isLoading={summariesLoading} />
        )}
        <UsageBreakdownTable
          title="Cost by Generation Type"
          data={summaryByType}
          isLoading={summariesLoading}
          error={summariesError}
          formatGroupKey={(key) => key.replace(/_/g, ' ')}
          groupLabel="Generation Type"
          divisor={scopeDivisor}
        />
        <UsageBreakdownTable
          title="Cost by Cache Participation"
          data={bucketByCacheParticipation(
            summaryByType.filter((row) => !isEvalGenerationType(row.groupKey))
          )}
          isLoading={summariesLoading}
          error={summariesError}
          groupLabel="Cache Participation"
          divisor={scopeDivisor}
        />
      </div>
    </>
  );
}

export function UsageStatCards({
  totals,
  conversationCount,
  messageCount,
  isLoading,
  error,
  scope,
  onScopeChange,
}: {
  totals: {
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    totalEvents: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  };
  conversationCount: number;
  messageCount: number;
  isLoading: boolean;
  error?: string | null;
  scope: StatScope;
  onScopeChange: (scope: StatScope) => void;
}) {
  const hasError = !!error;

  function cacheBreakdown(read: number, written: number): string | undefined {
    const parts: string[] = [];
    if (read > 0) parts.push(`${formatTokens(read)} read`);
    if (written > 0) parts.push(`${formatTokens(written)} written`);
    return parts.length > 1 ? parts.join(' / ') : undefined;
  }

  const stats = (() => {
    if (scope === 'per-conversation') {
      const div = conversationCount || 1;
      const avgCacheRead = Math.round(totals.totalCacheReadTokens / div);
      const avgCacheWritten = Math.round(totals.totalCacheCreationTokens / div);
      return {
        cost: formatCost(totals.totalCost / div),
        costDescription: `across ${conversationCount} conversation${conversationCount !== 1 ? 's' : ''}`,
        tokens: formatTokens(Math.round(totals.totalTokens / div)),
        tokensDescription: `${formatTokens(Math.round(totals.totalInputTokens / div))} in / ${formatTokens(Math.round(totals.totalOutputTokens / div))} out`,
        cacheTokens: formatTokens(avgCacheRead),
        cacheDescription: cacheBreakdown(avgCacheRead, avgCacheWritten),
      };
    }
    if (scope === 'per-message') {
      const div = messageCount || 1;
      const avgCacheRead = Math.round(totals.totalCacheReadTokens / div);
      const avgCacheWritten = Math.round(totals.totalCacheCreationTokens / div);
      return {
        cost: formatCost(totals.totalCost / div),
        costDescription: `across ${messageCount} message${messageCount !== 1 ? 's' : ''}`,
        tokens: formatTokens(Math.round(totals.totalTokens / div)),
        tokensDescription: `${formatTokens(Math.round(totals.totalInputTokens / div))} in / ${formatTokens(Math.round(totals.totalOutputTokens / div))} out`,
        cacheTokens: formatTokens(avgCacheRead),
        cacheDescription: cacheBreakdown(avgCacheRead, avgCacheWritten),
      };
    }
    return {
      cost: formatCost(totals.totalCost),
      costDescription: `${messageCount} message${messageCount !== 1 ? 's' : ''} · ${conversationCount} conversation${conversationCount !== 1 ? 's' : ''}`,
      tokens: formatTokens(totals.totalTokens),
      tokensDescription: `${formatTokens(totals.totalInputTokens)} in / ${formatTokens(totals.totalOutputTokens)} out`,
      cacheTokens: formatTokens(totals.totalCacheReadTokens),
      cacheDescription:
        totals.totalCacheCreationTokens > 0
          ? `${formatTokens(totals.totalCacheCreationTokens)} written`
          : undefined,
    };
  })();

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={scope} onValueChange={(v) => onScopeChange(v as StatScope)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Summary</span>
          <TabsList className="h-8">
            <TabsTrigger value="total" className="text-xs px-3 h-6">
              Total
            </TabsTrigger>
            <TabsTrigger value="per-conversation" className="text-xs px-3 h-6">
              Per Conversation
            </TabsTrigger>
            <TabsTrigger value="per-message" className="text-xs px-3 h-6">
              Per Message
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Cost"
          Icon={Coins}
          stat={stats.cost}
          statDescription={stats.costDescription}
          isLoading={isLoading}
          hasError={hasError}
        />
        <StatCard
          title="Tokens"
          Icon={Hash}
          stat={stats.tokens}
          statDescription={stats.tokensDescription}
          isLoading={isLoading}
          hasError={hasError}
        />
        <StatCard
          title="Cache Tokens"
          Icon={Database}
          stat={stats.cacheTokens}
          statDescription={stats.cacheDescription}
          isLoading={isLoading}
          hasError={hasError}
        />
      </div>
    </div>
  );
}

export function EvalCostCard({
  evalSummary,
  isLoading,
}: {
  evalSummary: EvalSummary;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Evaluation Cost</CardTitle>
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="text-2xl font-bold">{formatCost(evalSummary.totalCost)}</div>
            {evalSummary.evalCallCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatCost(evalSummary.totalCost / evalSummary.evalCallCount)} per evaluation
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatTokens(evalSummary.totalTokens)} tokens
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function UsageBreakdownTable({
  title,
  data,
  isLoading,
  error,
  formatGroupKey,
  groupLabel = 'Model',
  divisor = 1,
}: {
  title: string;
  data: UsageSummaryRow[];
  isLoading: boolean;
  error?: string | null;
  formatGroupKey?: (key: string) => ReactNode;
  groupLabel?: string;
  divisor?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cost data for this period</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupLabel}</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.groupKey}>
                  <TableCell className="font-mono text-sm max-w-[300px]">
                    <span className="block truncate" title={row.groupKey}>
                      {formatGroupKey ? formatGroupKey(row.groupKey) : row.groupKey}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCost(row.totalEstimatedCostUsd / divisor)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTokens(Math.round(row.totalTokens / divisor))}
                  </TableCell>
                  <TableCell className="text-right">
                    {Math.round(row.eventCount / divisor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  timeout: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

interface SigNozUsageEvent {
  spanId: string;
  traceId: string;
  timestamp: string;
  generationType: string;
  model: string;
  provider: string;
  agentId: string;
  subAgentId: string;
  subAgentName: string;
  conversationId: string;
  projectId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  finishReason: string;
  status: string;
}

export function UsageEventsTable({
  tenantId,
  projectId,
  events,
  isLoading,
  error,
  agentsById,
}: {
  tenantId: string;
  projectId?: string;
  events: SigNozUsageEvent[];
  isLoading: boolean;
  error?: string | null;
  agentsById: Map<string, AgentInfo>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Events</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cost events for this period</p>
        ) : (
          <Table className="min-w-max" containerClassName="max-h-[500px] overflow-auto">
            <TableHeader className="sticky top-0 z-20 bg-card">
              <TableRow>
                <TableHead className="sticky left-0 z-30 bg-card w-[72px] min-w-[72px]">
                  Time
                </TableHead>
                <TableHead className="sticky left-[72px] z-30 bg-card">Conversation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Cache read</TableHead>
                <TableHead className="text-right">Cache write</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Sub Agent</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.spanId}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap sticky left-0 z-10 bg-card w-[72px] min-w-[72px]">
                    {formatDateAgo(event.timestamp)}
                  </TableCell>
                  <TableCell className="sticky left-[72px] z-10 bg-card">
                    {(projectId || event.projectId) && event.conversationId ? (
                      <Link
                        href={`/${tenantId}/projects/${projectId || event.projectId}/traces/conversations/${event.conversationId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View trace
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[event.status] ?? ''}`}
                    >
                      {event.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.model}</TableCell>
                  <TableCell className="font-mono text-xs">{event.provider || '—'}</TableCell>
                  <TableCell className="text-right font-medium">
                    {event.estimatedCostUsd ? formatCost(event.estimatedCostUsd) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTokens(event.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {event.cacheReadTokens ? formatTokens(event.cacheReadTokens) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {event.cacheCreationTokens ? formatTokens(event.cacheCreationTokens) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTokens(event.outputTokens)}
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={event.agentId || undefined}>
                    <AgentLabel
                      agentId={event.agentId}
                      tenantId={tenantId}
                      agentsById={agentsById}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={event.subAgentId || undefined}>
                    {event.subAgentName && event.subAgentId
                      ? `${event.subAgentName} (${event.subAgentId})`
                      : event.subAgentName || event.subAgentId || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {event.generationType.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
