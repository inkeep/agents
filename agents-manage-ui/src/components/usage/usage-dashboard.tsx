'use client';

import { ChevronLeft, ChevronRight, Coins, ExternalLink, Hash, Layers, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { UsageEvent, UsageSummaryRow } from '@/lib/api/usage';
import { fetchUsageEvents, fetchUsageSummary } from '@/lib/api/usage';
import { formatDateAgo } from '@/lib/utils/format-date';

export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

interface UsageDashboardProps {
  tenantId: string;
  projectId?: string;
  startTime: string;
  endTime: string;
}

export function UsageDashboard({ tenantId, projectId, startTime, endTime }: UsageDashboardProps) {
  const [summaryByModel, setSummaryByModel] = useState<UsageSummaryRow[]>([]);
  const [summaryByDay, setSummaryByDay] = useState<UsageSummaryRow[]>([]);
  const [summaryByType, setSummaryByType] = useState<UsageSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseParams = { tenantId, projectId, from: startTime, to: endTime };

      const [byModel, byDay, byType] = await Promise.all([
        fetchUsageSummary({ ...baseParams, groupBy: 'model' }),
        fetchUsageSummary({ ...baseParams, groupBy: 'day' }),
        fetchUsageSummary({ ...baseParams, groupBy: 'generation_type' }),
      ]);

      setSummaryByModel(byModel);
      setSummaryByDay(byDay);
      setSummaryByType(byType);
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, startTime, endTime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    return summaryByModel.reduce(
      (acc, row) => ({
        totalTokens: acc.totalTokens + row.totalTokens,
        totalInputTokens: acc.totalInputTokens + row.totalInputTokens,
        totalOutputTokens: acc.totalOutputTokens + row.totalOutputTokens,
        totalCost: acc.totalCost + row.totalEstimatedCostUsd,
        totalEvents: acc.totalEvents + row.eventCount,
      }),
      { totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, totalEvents: 0 }
    );
  }, [summaryByModel]);

  const chartData = useMemo(() => {
    return summaryByDay
      .map((row) => ({ date: row.groupKey, tokens: row.totalTokens }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [summaryByDay]);

  return (
    <>
      <UsageStatCards totals={totals} modelCount={summaryByModel.length} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UsageBreakdownTable title="Usage by Model" data={summaryByModel} isLoading={isLoading} />
        <UsageBreakdownTable
          title="Usage by Type"
          data={summaryByType}
          isLoading={isLoading}
          formatGroupKey={(key) => key.replace(/_/g, ' ')}
          groupLabel="Generation Type"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="min-h-0">
          {chartData.length > 0 && (
            <AreaChartCard
              title="Token Usage Over Time"
              className="h-full"
              chartContainerClassName="h-full min-h-[300px] w-full"
              config={{ tokens: { color: 'var(--chart-1)', label: 'Tokens' } }}
              data={chartData}
              dataKeyOne="tokens"
              xAxisDataKey="date"
              isLoading={isLoading}
              tickFormatter={(value: string) => {
                try {
                  const [y, m, d] = value.split('-').map(Number);
                  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                } catch {
                  return value;
                }
              }}
              yAxisTickFormatter={(value: number | string) =>
                formatTokens(typeof value === 'string' ? Number.parseInt(value, 10) : value)
              }
            />
          )}
        </div>
        <div>
          <UsageEventsTable
            tenantId={tenantId}
            projectId={projectId}
            startTime={startTime}
            endTime={endTime}
          />
        </div>
      </div>
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
        title="Total Tokens"
        Icon={Hash}
        stat={formatTokens(totals.totalTokens)}
        statDescription={`${formatTokens(totals.totalInputTokens)} in / ${formatTokens(totals.totalOutputTokens)} out`}
        isLoading={isLoading}
      />
      <StatCard
        title="Estimated Cost"
        Icon={Coins}
        stat={formatCost(totals.totalCost)}
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
          <p className="text-sm text-muted-foreground">No usage data for this period</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupLabel}</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.groupKey}>
                  <TableCell className="font-mono text-sm">
                    {formatGroupKey ? formatGroupKey(row.groupKey) : row.groupKey}
                  </TableCell>
                  <TableCell className="text-right">{formatTokens(row.totalTokens)}</TableCell>
                  <TableCell className="text-right">
                    {formatCost(row.totalEstimatedCostUsd)}
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

function UsageEventsTable({
  tenantId,
  projectId,
  startTime,
  endTime,
}: {
  tenantId: string;
  projectId?: string;
  startTime: string;
  endTime: string;
}) {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);

  const loadEvents = useCallback(
    async (cursor?: string) => {
      setIsLoading(true);
      try {
        const result = await fetchUsageEvents({
          tenantId,
          projectId,
          from: startTime,
          to: endTime,
          cursor,
          limit: 25,
        });
        setEvents(result.data);
        setNextCursor(result.nextCursor);
      } catch (error) {
        console.error('Failed to fetch usage events:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, projectId, startTime, endTime]
  );

  useEffect(() => {
    setPrevCursors([]);
    loadEvents();
  }, [loadEvents]);

  const handleNextPage = () => {
    if (!nextCursor) return;
    const currentFirst = events[0]?.createdAt;
    if (currentFirst) setPrevCursors((prev) => [...prev, currentFirst]);
    loadEvents(nextCursor);
  };

  const handlePrevPage = () => {
    if (prevCursors.length === 0) return;
    const prev = [...prevCursors];
    prev.pop();
    setPrevCursors(prev);
    loadEvents(prev.length > 0 ? prev[prev.length - 1] : undefined);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Usage Events</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={prevCursors.length === 0 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={!nextCursor || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage events for this period</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Sub Agent</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Conversation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.requestId}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateAgo(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {event.generationType.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.resolvedModel ?? event.requestedModel}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.agentId}</TableCell>
                    <TableCell className="font-mono text-xs">{event.subAgentId ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatTokens(event.inputTokens)}</TableCell>
                    <TableCell className="text-right">{formatTokens(event.outputTokens)}</TableCell>
                    <TableCell className="text-right">
                      {event.estimatedCostUsd
                        ? formatCost(Number.parseFloat(event.estimatedCostUsd))
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[event.status] ?? ''}`}
                      >
                        {event.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {event.conversationId ? (
                        <Link
                          href={`/${tenantId}/projects/${event.projectId}/traces/conversations/${event.conversationId}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View trace
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
