'use client';

import { AlertTriangle, Layers, MessageSquare, SparklesIcon, Wrench, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { ExternalLink } from '@/components/ui/external-link';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DOCS_BASE_URL } from '@/constants/theme';
import { useSignozConfig } from '@/hooks/use-signoz-config';
import {
  useConversationsPerDayAcrossProjects,
  useProjectOverviewStats,
  useStatsByProject,
} from '@/hooks/use-traces';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function ProjectsStatsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const router = useRouter();
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
  } = useTracesQueryState();

  const { isLoading: isSignozConfigLoading, configError: signozConfigError } = useSignozConfig();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  // Fetch projects on mount
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

  // Calculate time range based on selection
  const { startTime, endTime } = useMemo(() => {
    const currentEndTime = Date.now() - 1;

    if (selectedTimeRange === CUSTOM) {
      if (customStartDate && customEndDate) {
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
        const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);
        const clampedEndMs = Math.min(endDate.getTime(), currentEndTime);

        return {
          startTime: startDate.getTime(),
          endTime: clampedEndMs,
        };
      }
      const hoursBack = TIME_RANGES['30d'].hours;
      return {
        startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
        endTime: currentEndTime,
      };
    }

    const hoursBack =
      TIME_RANGES[selectedTimeRange as keyof typeof TIME_RANGES]?.hours || TIME_RANGES['30d'].hours;
    const calculatedStart = currentEndTime - hoursBack * 60 * 60 * 1000;

    return {
      startTime: calculatedStart,
      endTime: currentEndTime,
    };
  }, [selectedTimeRange, customStartDate, customEndDate]);

  // Memoize projectIds to prevent new array reference on every render
  const projectIds = useMemo(
    () => (selectedProjectId ? [selectedProjectId] : undefined),
    [selectedProjectId]
  );

  const {
    stats: overviewStats,
    loading: overviewLoading,
    error: overviewError,
  } = useProjectOverviewStats({
    startTime,
    endTime,
    projectIds,
    tenantId,
  });

  const { data: activityData, loading: activityLoading } = useConversationsPerDayAcrossProjects({
    startTime,
    endTime,
    projectIds,
    tenantId,
  });

  const { data: projectStats, loading: projectStatsLoading } = useStatsByProject({
    startTime,
    endTime,
    projectIds,
    tenantId,
  });

  // Create a map of project IDs to names
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.projectId, project.name);
    }
    return map;
  }, [projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Statistics"
        description="View aggregated statistics across all projects or filter by a specific project."
      />

      {/* Signoz Configuration Banner */}
      {!isSignozConfigLoading && signozConfigError && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>SigNoz Configuration Error</AlertTitle>
          <AlertDescription>
            <p>
              {signozConfigError} Please follow the instructions in the{' '}
              <ExternalLink
                className="text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
                iconClassName="text-amber-700 dark:text-amber-300 dark:group-hover/link:text-amber-200"
                href={`${DOCS_BASE_URL}/get-started/traces`}
              >
                traces setup guide
              </ExternalLink>
              .
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Project Filter */}
        <Combobox
          defaultValue={selectedProjectId}
          notFoundMessage={'No projects found.'}
          onSelect={(value) => {
            setSelectedProjectId(value);
          }}
          options={projects.map((project) => ({
            value: project.projectId,
            label: project.name,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={projectsLoading}
              filterLabel={selectedProjectId ? 'Project' : 'All projects'}
              isRemovable={true}
              onDeleteFilter={() => {
                setSelectedProjectId(undefined);
              }}
              multipleCheckboxValues={selectedProjectId ? [selectedProjectId] : []}
              options={projects.map((project) => ({
                value: project.projectId,
                label: project.name,
              }))}
            />
          }
        />
        {/* Time Range Filter */}
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

      {overviewError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Stats</AlertTitle>
          <AlertDescription>{overviewError}</AlertDescription>
        </Alert>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Conversations Activity Chart - Left side, takes 6 columns */}
        <div className="col-span-12 xl:col-span-6">
          <AreaChartCard
            chartContainerClassName="h-[250px] xl:h-100 aspect-auto w-full"
            config={{
              count: {
                color: 'var(--chart-1)',
                label: 'Conversations',
              },
            }}
            data={activityData}
            dataKeyOne="count"
            hasError={!!overviewError}
            isLoading={activityLoading}
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
            title="Conversations per day"
            xAxisDataKey="date"
            yAxisDataKey="count"
            yAxisTickFormatter={(value: number | string) => value?.toLocaleString()}
          />
        </div>

        {/* KPI Cards - Right side, takes 6 columns */}
        <div className="col-span-12 xl:col-span-6">
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Total Conversations */}
            <StatCard
              title="Total Conversations"
              stat={overviewStats.totalConversations}
              statDescription="Unique conversation threads"
              isLoading={overviewLoading}
              Icon={MessageSquare}
            />

            {/* Trigger Invocations */}
            <StatCard
              title="Trigger Invocations"
              stat={overviewStats.totalTriggerInvocations}
              statDescription="Webhook trigger executions"
              isLoading={overviewLoading}
              Icon={Zap}
            />

            {/* Total AI Calls */}
            <StatCard
              title="Total AI Calls"
              stat={overviewStats.totalAICalls}
              statDescription="Click to view details"
              isLoading={overviewLoading}
              Icon={SparklesIcon}
              onClick={() => {
                if (selectedProjectId) {
                  router.push(`/${tenantId}/projects/${selectedProjectId}/traces/ai-calls`);
                } else {
                  router.push(`/${tenantId}/stats/ai-calls`);
                }
              }}
            />

            {/* Total MCP Calls */}
            <StatCard
              title="Total MCP Calls"
              stat={overviewStats.totalMCPCalls}
              statDescription="Click to view details"
              isLoading={overviewLoading}
              Icon={Wrench}
              onClick={() => {
                if (selectedProjectId) {
                  router.push(`/${tenantId}/projects/${selectedProjectId}/traces/tool-calls`);
                } else {
                  router.push(`/${tenantId}/stats/tool-calls`);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Most Used Projects */}
      {!selectedProjectId && (
        <Card className="shadow-none bg-background mt-8 pb-0">
          <CardHeader>
            <CardTitle className="flex font-medium items-center gap-4 text-foreground">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-400 dark:text-white/40" />
                Projects
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="lg:table-fixed">
              <TableHeader>
                <TableRow noHover>
                  <TableHead className="md:w-full min-w-48">Project</TableHead>
                  <TableHead className="text-right lg:w-40">Conversations</TableHead>
                  <TableHead className="text-right lg:w-36">AI Calls</TableHead>
                  <TableHead className="text-right lg:w-36">MCP Calls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/50">
                {projectStatsLoading ? (
                  [1, 2, 3].map((row) => (
                    <TableRow key={row} noHover>
                      <TableCell className="py-4">
                        <Skeleton className="h-6 w-32" />
                      </TableCell>
                      {[1, 2, 3].map((col) => (
                        <TableCell key={col} className="text-right py-4">
                          <Skeleton className="h-6 w-12 ml-auto" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : projectStats.length === 0 ? (
                  <TableRow noHover>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No project data available for the selected time range.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...projectStats]
                    .sort((a, b) => b.totalConversations - a.totalConversations)
                    .map((stat) => (
                      <TableRow key={stat.projectId}>
                        <TableCell className="font-medium p-0">
                          <Link
                            href={`/${tenantId}/projects/${stat.projectId}/traces`}
                            className="truncate block w-0 min-w-full py-4 px-4"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {projectNameMap.get(stat.projectId) || stat.projectId}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right p-0">
                          <Link
                            href={`/${tenantId}/projects/${stat.projectId}/traces`}
                            className="block py-4 px-4 font-mono text-primary text-base font-bold hover:underline underline-offset-2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {stat.totalConversations.toLocaleString()}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right p-0">
                          <Link
                            href={`/${tenantId}/projects/${stat.projectId}/traces/ai-calls`}
                            className="block py-4 px-4 font-mono text-muted-foreground text-base hover:underline underline-offset-2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {stat.totalAICalls.toLocaleString()}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right p-0">
                          <Link
                            href={`/${tenantId}/projects/${stat.projectId}/traces/tool-calls`}
                            className="block py-4 px-4 font-mono text-muted-foreground text-base hover:underline underline-offset-2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {stat.totalMCPCalls.toLocaleString()}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
