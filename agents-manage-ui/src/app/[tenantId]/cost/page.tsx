'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { CostDashboard } from '@/components/cost/cost-dashboard';
import { PageHeader } from '@/components/layout/page-header';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { Combobox } from '@/components/ui/combobox';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { fetchProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/types/project';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function TenantUsagePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
  } = useTracesQueryState();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchProjects(tenantId).then((result) => {
      if (result.data) setProjects(result.data);
    });
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Cost & Token Usage"
        description="Estimated costs and token usage across your agents"
      />

      <div className="flex items-center gap-4 flex-wrap">
        <Combobox
          defaultValue={selectedProjectId}
          notFoundMessage="No projects found."
          onSelect={(value: string) => setSelectedProjectId(value || undefined)}
          options={projects.map((p) => ({ value: p.projectId, label: p.name }))}
          TriggerComponent={
            <FilterTriggerComponent
              filterLabel={selectedProjectId ? 'Project' : 'All projects'}
              isRemovable={true}
              onDeleteFilter={() => setSelectedProjectId(undefined)}
              multipleCheckboxValues={selectedProjectId ? [selectedProjectId] : []}
              options={projects.map((p) => ({ value: p.projectId, label: p.name }))}
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

      <CostDashboard
        tenantId={tenantId}
        projectId={selectedProjectId}
        startTime={startTime}
        endTime={endTime}
      />
    </div>
  );
}
