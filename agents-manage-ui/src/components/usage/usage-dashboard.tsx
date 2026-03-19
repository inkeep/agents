'use client';

import { Coins, Hash, Layers, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
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
import type { UsageSummaryRow } from '@/lib/api/usage';
import { fetchUsageSummary } from '@/lib/api/usage';

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

      {chartData.length > 0 && (
        <AreaChartCard
          title="Token Usage Over Time"
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
