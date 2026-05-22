'use client';

import { Coins, ExternalLink, Hash, Layers, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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

interface CostDashboardProps {
  tenantId: string;
  projectId?: string;
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
}

export function CostDashboard({ tenantId, projectId, startTime, endTime }: CostDashboardProps) {
  const [summaryByModel, setSummaryByModel] = useState<UsageSummaryRow[]>([]);
  const [summaryByAgent, setSummaryByAgent] = useState<UsageSummaryRow[]>([]);
  const [summaryByType, setSummaryByType] = useState<UsageSummaryRow[]>([]);
  const [summaryByProvider, setSummaryByProvider] = useState<UsageSummaryRow[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(true);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  const [events, setEvents] = useState<SigNozUsageEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [chartData, setChartData] = useState<Array<{ date: string; cost: number }>>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummariesLoading(true);
    setSummariesError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    getSigNozStatsClient(tenantId)
      .getUsageCostSummaries(
        start,
        end,
        ['model', 'agent', 'generation_type', 'provider'] as const,
        projectId
      )
      .then((summaries) => {
        if (cancelled) return;
        setSummaryByModel(summaries.model);
        setSummaryByAgent(summaries.agent);
        setSummaryByType(summaries.generation_type);
        setSummaryByProvider(summaries.provider);
      })
      .catch((error) => {
        if (cancelled) return;
        setSummariesError(error instanceof Error ? error.message : 'Failed to load cost summaries');
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, startTime, endTime]);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    getSigNozStatsClient(tenantId)
      .getUsageEventsList(start, end, projectId, undefined, 200)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        setEventsError(error instanceof Error ? error.message : 'Failed to load cost events');
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, startTime, endTime]);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    getSigNozStatsClient(tenantId)
      .getUsageCostPerDay(start, end, projectId)
      .then((data) => {
        if (cancelled) return;
        setChartData(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setChartError(error instanceof Error ? error.message : 'Failed to load cost chart');
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, startTime, endTime]);

  const totals = summaryByModel.reduce(
    (acc, row) => ({
      totalTokens: acc.totalTokens + row.totalTokens,
      totalInputTokens: acc.totalInputTokens + row.totalInputTokens,
      totalOutputTokens: acc.totalOutputTokens + row.totalOutputTokens,
      totalCost: acc.totalCost + row.totalEstimatedCostUsd,
      totalEvents: acc.totalEvents + row.eventCount,
    }),
    { totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, totalEvents: 0 }
  );

  const agentNamesById = new Map<string, string>();
  for (const e of events) {
    if (e.agentName && !agentNamesById.has(e.agentId)) {
      agentNamesById.set(e.agentId, e.agentName);
    }
  }

  return (
    <>
      <UsageStatCards
        totals={totals}
        modelCount={summaryByModel.length}
        isLoading={summariesLoading}
        error={summariesError}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <UsageBreakdownTable
          title="Cost by Model"
          data={summaryByModel}
          isLoading={summariesLoading}
          error={summariesError}
        />
        <UsageBreakdownTable
          title="Cost by Agent"
          data={summaryByAgent}
          isLoading={summariesLoading}
          error={summariesError}
          groupLabel="Agent"
          formatGroupKey={(agentId) => {
            const name = agentNamesById.get(agentId);
            return name ? `${name} (${agentId})` : agentId;
          }}
        />
        <UsageBreakdownTable
          title="Cost by Provider"
          data={summaryByProvider}
          isLoading={summariesLoading}
          error={summariesError}
          groupLabel="Provider"
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
          />
        </div>
      </div>

      <UsageBreakdownTable
        title="Cost by Generation Type"
        data={summaryByType}
        isLoading={summariesLoading}
        error={summariesError}
        formatGroupKey={(key) => key.replace(/_/g, ' ')}
        groupLabel="Generation Type"
      />
    </>
  );
}

function UsageStatCards({
  totals,
  modelCount,
  isLoading,
  error,
}: {
  totals: {
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    totalEvents: number;
  };
  modelCount: number;
  isLoading: boolean;
  error?: string | null;
}) {
  const hasError = !!error;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Estimated Cost"
        Icon={Coins}
        stat={formatCost(totals.totalCost)}
        isLoading={isLoading}
        hasError={hasError}
      />
      <StatCard
        title="Total Tokens"
        Icon={Hash}
        stat={formatTokens(totals.totalTokens)}
        statDescription={`${formatTokens(totals.totalInputTokens)} in / ${formatTokens(totals.totalOutputTokens)} out`}
        isLoading={isLoading}
        hasError={hasError}
      />
      <StatCard
        title="Generations"
        Icon={Zap}
        stat={totals.totalEvents}
        isLoading={isLoading}
        hasError={hasError}
      />
      <StatCard
        title="Models Used"
        Icon={Layers}
        stat={modelCount}
        isLoading={isLoading}
        hasError={hasError}
      />
    </div>
  );
}

function UsageBreakdownTable({
  title,
  data,
  isLoading,
  error,
  formatGroupKey,
  groupLabel = 'Model',
}: {
  title: string;
  data: UsageSummaryRow[];
  isLoading: boolean;
  error?: string | null;
  formatGroupKey?: (key: string) => string;
  groupLabel?: string;
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
                    {formatCost(row.totalEstimatedCostUsd)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTokens(row.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right">{row.eventCount}</TableCell>
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
  agentName: string;
  subAgentId: string;
  subAgentName: string;
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  finishReason: string;
  status: string;
}

function UsageEventsTable({
  tenantId,
  projectId,
  events,
  isLoading,
  error,
}: {
  tenantId: string;
  projectId?: string;
  events: SigNozUsageEvent[];
  isLoading: boolean;
  error?: string | null;
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
          <Table className="min-w-max" containerClassName="max-h-[500px] overflow-y-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Conversation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Sub Agent</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.spanId}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateAgo(event.timestamp)}
                  </TableCell>
                  <TableCell>
                    {projectId && event.conversationId ? (
                      <Link
                        href={`/${tenantId}/projects/${projectId}/traces/conversations/${event.conversationId}`}
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
                    {formatTokens(event.outputTokens)}
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={event.agentId || undefined}>
                    {event.agentName && event.agentId
                      ? `${event.agentName} (${event.agentId})`
                      : event.agentName || event.agentId || '—'}
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
