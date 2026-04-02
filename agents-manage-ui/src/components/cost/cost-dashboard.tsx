'use client';

import { Coins, ExternalLink, Hash, Layers, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
  const [events, setEvents] = useState<SigNozUsageEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const client = getSigNozStatsClient(tenantId);
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();

      const [byModel, byAgent, byType, byProvider, eventsList] = await Promise.all([
        client.getUsageCostSummary(start, end, 'model', projectId),
        client.getUsageCostSummary(start, end, 'agent', projectId),
        client.getUsageCostSummary(start, end, 'generation_type', projectId),
        client.getUsageCostSummary(start, end, 'provider', projectId),
        client.getUsageEventsList(start, end, projectId, undefined, 200),
      ]);

      setSummaryByModel(byModel);
      setSummaryByAgent(byAgent);
      setSummaryByType(byType);
      setSummaryByProvider(byProvider);
      setEvents(eventsList);
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, startTime, endTime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const buckets = new Map<string, number>();
  for (const event of events) {
    if (!event.timestamp) continue;
    const date = new Date(event.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + event.estimatedCostUsd);
  }
  const chartData = [...buckets.entries()]
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <UsageStatCards totals={totals} modelCount={summaryByModel.length} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <UsageBreakdownTable title="Cost by Model" data={summaryByModel} isLoading={isLoading} />
        <UsageBreakdownTable
          title="Cost by Agent"
          data={summaryByAgent}
          isLoading={isLoading}
          groupLabel="Agent"
        />
        <UsageBreakdownTable
          title="Cost by Provider"
          data={summaryByProvider}
          isLoading={isLoading}
          groupLabel="Provider"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="min-h-0">
          {chartData.length > 0 && (
            <AreaChartCard
              title="Cost Over Time"
              className="h-full"
              chartContainerClassName="h-full min-h-[300px] w-full"
              config={{ cost: { color: 'var(--chart-2)', label: 'Cost (USD)' } }}
              data={chartData}
              dataKeyOne="cost"
              xAxisDataKey="date"
              isLoading={isLoading}
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
          )}
        </div>
        <div>
          <UsageEventsTable
            tenantId={tenantId}
            projectId={projectId}
            events={events}
            isLoading={isLoading}
          />
        </div>
      </div>

      <UsageBreakdownTable
        title="Cost by Generation Type"
        data={summaryByType}
        isLoading={isLoading}
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
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Estimated Cost"
        Icon={Coins}
        stat={formatCost(totals.totalCost)}
        isLoading={isLoading}
      />
      <StatCard
        title="Total Tokens"
        Icon={Hash}
        stat={formatTokens(totals.totalTokens)}
        statDescription={`${formatTokens(totals.totalInputTokens)} in / ${formatTokens(totals.totalOutputTokens)} out`}
        isLoading={isLoading}
      />
      <StatCard title="Generations" Icon={Zap} stat={totals.totalEvents} isLoading={isLoading} />
      <StatCard title="Models Used" Icon={Layers} stat={modelCount} isLoading={isLoading} />
    </div>
  );
}

function UsageBreakdownTable({
  title,
  data,
  isLoading,
  formatGroupKey,
  groupLabel = 'Model',
}: {
  title: string;
  data: UsageSummaryRow[];
  isLoading: boolean;
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
                  <TableCell className="font-mono text-sm">
                    {formatGroupKey ? formatGroupKey(row.groupKey) : row.groupKey}
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
  subAgentId: string;
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
}: {
  tenantId: string;
  projectId?: string;
  events: SigNozUsageEvent[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Events</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
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
                  <TableCell className="font-mono text-xs">{event.agentId || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{event.subAgentId || '—'}</TableCell>
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
