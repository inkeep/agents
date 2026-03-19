'use client';

import { use, useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { UsageDashboard } from '@/components/usage/usage-dashboard';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function ProjectUsagePage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = use(params);
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
  } = useTracesQueryState();

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Usage" description="Token usage and estimated costs for this project" />

      <div className="flex items-center gap-4 flex-wrap">
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

      <UsageDashboard
        tenantId={tenantId}
        projectId={projectId}
        startTime={startTime}
        endTime={endTime}
      />
    </div>
  );
}
