'use client';

import { Coins, Hash, Layers, Zap } from 'lucide-react';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { UsageSummaryRow } from '@/lib/api/usage';
import { fetchUsageSummary } from '@/lib/api/usage';
import type { Project } from '@/lib/types/project';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

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

export default function UsageDashboardPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
  } = useTracesQueryState();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  const [summaryByModel, setSummaryByModel] = useState<UsageSummaryRow[]>([]);
  const [summaryByDay, setSummaryByDay] = useState<UsageSummaryRow[]>([]);
  const [summaryByType, setSummaryByType] = useState<UsageSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setProjectsLoading(true);
        const result = await fetchProjectsAction(tenantId);
        if (result.success && result.data) {
          setProjects(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setProjectsLoading(false);
      }
    };
    loadProjects();
  }, [tenantId]);

  const { startTime, endTime } = useMemo(() => {
    if (selectedTimeRange === CUSTOM && customStartDate && customEndDate) {
      return {
        startTime: new Date(customStartDate).toISOString(),
        endTime: new Date(customEndDate).toISOString(),
      };
    }
    const range = TIME_RANGES[selectedTimeRange as keyof typeof TIME_RANGES] ?? TIME_RANGES['30d'];
    const end = new Date();
    const start = new Date(end.getTime() - range.hours * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }, [selectedTimeRange, customStartDate, customEndDate]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseParams = {
        tenantId,
        projectId: selectedProjectId,
        from: startTime,
        to: endTime,
      };

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
  }, [tenantId, selectedProjectId, startTime, endTime]);

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
      .map((row) => ({
        date: row.groupKey,
        tokens: row.totalTokens,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [summaryByDay]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Usage" description="Token usage and estimated costs across your agents" />

      <div className="flex items-center gap-4 flex-wrap">
        <Combobox
          defaultValue={selectedProjectId}
          notFoundMessage="No projects found."
          onSelect={(value: string) => {
            setSelectedProjectId(value || undefined);
          }}
          options={projects.map((project) => ({
            value: project.id,
            label: project.name || project.id,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              label="Project"
              value={
                selectedProjectId
                  ? (projects.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId)
                  : 'All Projects'
              }
            />
          }
        />
        <DatePickerWithPresets
          label="Time range"
          onRemove={() => setSelectedTimeRange('30d')}
          value={
            selectedTimeRange === CUSTOM
              ? { from: customStartDate, to: customEndDate }
              : selectedTimeRange
          }
          onAdd={(value: TimeRange) => setSelectedTimeRange(value)}
          setCustomDateRange={(start: string, end: string) => setCustomDateRange(start, end)}
          options={Object.entries(TIME_RANGES).map(([value, config]) => ({
            value,
            label: config.label,
          }))}
        />
      </div>

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
        <StatCard
          title="Models Used"
          Icon={Layers}
          stat={summaryByModel.length}
          isLoading={isLoading}
        />
      </div>

      {chartData.length > 0 && (
        <AreaChartCard
          title="Token Usage Over Time"
          config={{
            tokens: {
              color: 'var(--chart-1)',
              label: 'Tokens',
            },
          }}
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
            formatTokens(typeof value === 'string' ? Number.parseInt(value) : value)
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : summaryByModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage data for this period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryByModel.map((row) => (
                    <TableRow key={row.groupKey}>
                      <TableCell className="font-mono text-sm">{row.groupKey}</TableCell>
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

        <Card>
          <CardHeader>
            <CardTitle>Usage by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : summaryByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage data for this period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Generation Type</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryByType.map((row) => (
                    <TableRow key={row.groupKey}>
                      <TableCell className="font-mono text-sm">
                        {row.groupKey.replace(/_/g, ' ')}
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
      </div>
    </div>
  );
}
