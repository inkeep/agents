'use client';

import { ArrowLeft, CheckCircle, FolderKanban, Server, Wrench } from 'lucide-react';
import NextLink from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
// import { ToolCallsByServerCard } from '@/components/traces/tool-calls-by-server-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { UNKNOWN_VALUE } from '@/constants/signoz';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { fetchProjectsAction } from '@/lib/actions/projects';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';
import type { Project } from '@/lib/types/project';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function AllProjectsToolCallsBreakdown({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);

  const backLink = `/${tenantId}/stats`;

  const { timeRange, customStartDate, customEndDate, setTimeRange, setCustomDateRange } =
    useTracesQueryState();

  const [projectStats, setProjectStats] = useState<
    Array<{
      projectId: string;
      totalConversations: number;
      totalAICalls: number;
      totalMCPCalls: number;
    }>
  >([]);
  const [toolCalls, setToolCalls] = useState<
    Array<{
      toolName: string;
      serverName: string;
      serverId: string;
      totalCalls: number;
      errorCount: number;
      errorRate: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setProjectsLoading(false);
      }
    };
    loadProjects();
  }, [tenantId]);

  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value !== CUSTOM) {
      setCustomDateRange('', '');
    }
  };

  const { startTime, endTime } = useMemo(() => {
    const currentEndTime = Date.now();

    if (timeRange === CUSTOM) {
      if (customStartDate && customEndDate) {
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
        const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);
        const clampedEndMs = Math.min(endDate.getTime(), Date.now() - 1);

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

    const hoursBack = TIME_RANGES[timeRange as keyof typeof TIME_RANGES]?.hours || 24 * 30;
    return {
      startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
      endTime: currentEndTime,
    };
  }, [timeRange, customStartDate, customEndDate]);

  // Fetch tool calls data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);
        const projectIdFilter = selectedProjectId === undefined ? undefined : [selectedProjectId];

        // Fetch project stats and tool breakdown
        const [projectData, toolData] = await Promise.all([
          client.getStatsByProject(startTime, endTime, projectIdFilter),
          client.getToolCallsByTool(
            startTime,
            endTime,
            undefined,
            selectedProjectId === undefined ? undefined : selectedProjectId
          ),
        ]);

        setProjectStats(projectData);
        setToolCalls(toolData);
      } catch (err) {
        console.error('Error fetching tool calls data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch tool calls data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedProjectId, startTime, endTime, tenantId]);

  // Create a map of project IDs to names
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.projectId, project.name);
    }
    return map;
  }, [projects]);

  const totalMCPCalls = projectStats.reduce((sum, item) => sum + item.totalMCPCalls, 0);
  const totalToolErrors = toolCalls.reduce((sum, item) => sum + item.errorCount, 0);
  const totalToolCalls = toolCalls.reduce((sum, item) => sum + item.totalCalls, 0);
  const overallSuccessRate =
    totalToolCalls > 0 ? ((totalToolCalls - totalToolErrors) / totalToolCalls) * 100 : 100;

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="shadow-none bg-background">
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <Wrench className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load tool calls data</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button asChild variant="ghost" size="icon-sm">
          <NextLink href={backLink}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Stats</span>
          </NextLink>
        </Button>
        <PageHeader title="Tool Calls Breakdown" className="mb-0" />
      </div>

      {/* Filters Card */}

      <div className="flex flex-col md:flex-row gap-2 md:gap-4 max-w-4xl">
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
              filterLabel={selectedProjectId === undefined ? 'All projects' : 'Project'}
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
          onRemove={() => setTimeRange('30d')}
          value={timeRange === CUSTOM ? { from: customStartDate, to: customEndDate } : timeRange}
          onAdd={(value: TimeRange) => handleTimeRangeChange(value)}
          setCustomDateRange={(start: string, end: string) => setCustomDateRange(start, end)}
          options={Object.entries(TIME_RANGES).map(([value, config]) => ({
            value,
            label: config.label,
          }))}
          showCalendarDirectly={false}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Total MCP Calls"
          stat={totalMCPCalls}
          statDescription={
            selectedProjectId === undefined
              ? `Tool calls across all ${projectStats.length} projects`
              : `Tool calls for selected project`
          }
          isLoading={loading}
          Icon={Wrench}
        />
        <StatCard
          title="Success Rate"
          stat={Number(overallSuccessRate.toFixed(0))}
          unit="%"
          statDescription={`${totalToolCalls - totalToolErrors} / ${totalToolCalls} calls successful`}
          isLoading={loading}
          Icon={CheckCircle}
        />
      </div>

      {/* Project Calls List */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">MCP Calls by Project</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : projectStats.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {[...projectStats]
                .sort((a, b) => b.totalMCPCalls - a.totalMCPCalls)
                .map((project, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-orange-50/30 dark:bg-orange-900/20 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <FolderKanban className="h-5 w-5 text-orange-600" />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">
                          {projectNameMap.get(project.projectId) || project.projectId}
                        </span>
                        {project.projectId !== UNKNOWN_VALUE &&
                          projectNameMap.get(project.projectId) && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {project.projectId}
                            </span>
                          )}
                        <span className="text-xs text-muted-foreground">
                          {project.totalConversations.toLocaleString()} conversations
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-orange-600">
                        {project.totalMCPCalls.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">MCP calls</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No MCP calls found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No MCP calls detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tool Breakdown by Server */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">Tool Calls by Server</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            (() => {
              const toolsByServer = toolCalls.reduce(
                (acc, tool) => {
                  const serverName = tool.serverName || UNKNOWN_VALUE;
                  if (!acc[serverName]) {
                    acc[serverName] = [];
                  }
                  acc[serverName].push(tool);
                  return acc;
                },
                {} as Record<string, typeof toolCalls>
              );

              const serverNames = Object.keys(toolsByServer).sort((a, b) => {
                if (a === UNKNOWN_VALUE) return 1;
                if (b === UNKNOWN_VALUE) return -1;
                return a.localeCompare(b);
              });

              if (serverNames.length === 0) {
                return (
                  <div className="text-center py-8">
                    <Server className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No tool calls found.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      No MCP tool calls detected in the selected time range.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {serverNames.map((serverName) => {
                    const serverTools = toolsByServer[serverName];
                    const serverTotalCalls = serverTools.reduce((sum, t) => sum + t.totalCalls, 0);
                    const serverTotalErrors = serverTools.reduce((sum, t) => sum + t.errorCount, 0);
                    const serverSuccessful = serverTotalCalls - serverTotalErrors;
                    const serverSuccessRate =
                      serverTotalCalls > 0 ? (serverSuccessful / serverTotalCalls) * 100 : 0;

                    const serverId = serverTools[0]?.serverId;

                    return (
                      <div key={serverName} className="space-y-2">
                        <div
                          className={`flex items-center justify-between p-4 rounded-lg border ${serverSuccessRate === 0 ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-border bg-muted/40'}`}
                        >
                          <div className="flex items-center gap-3">
                            <Server
                              className={`h-5 w-5 ${serverSuccessRate === 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
                            />
                            <div>
                              <span
                                className={`text-sm font-semibold ${serverSuccessRate === 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground'}`}
                              >
                                {serverName === UNKNOWN_VALUE ? 'Unknown Server' : serverName}
                              </span>
                              {serverId && serverId !== UNKNOWN_VALUE && (
                                <p
                                  className={`text-xs font-mono ${serverSuccessRate === 0 ? 'text-red-600/80 dark:text-red-400/80' : 'text-muted-foreground'}`}
                                >
                                  {serverId}
                                </p>
                              )}
                              <p
                                className={`text-xs ${serverSuccessRate === 0 ? 'text-red-600/80 dark:text-red-400/80' : 'text-muted-foreground'}`}
                              >
                                {serverTools.length} tool{serverTools.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-lg font-bold ${serverSuccessRate === 0 ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}
                            >
                              {serverSuccessRate.toFixed(0)}%
                            </div>
                            <div
                              className={`text-xs ${serverSuccessRate === 0 ? 'text-red-600/80 dark:text-red-400/80' : 'text-muted-foreground'}`}
                            >
                              {serverSuccessful}/{serverTotalCalls} calls
                            </div>
                          </div>
                        </div>

                        <div className="ml-6 space-y-2">
                          {serverTools
                            .sort((a, b) => b.totalCalls - a.totalCalls)
                            .map((tool, toolIndex) => {
                              const successfulCalls = tool.totalCalls - tool.errorCount;
                              const successRate =
                                tool.totalCalls > 0 ? (successfulCalls / tool.totalCalls) * 100 : 0;
                              return (
                                <div
                                  key={toolIndex}
                                  className={`flex items-center justify-between p-3 rounded-md border ${successRate === 0 ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-border/50 bg-muted/20'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Wrench
                                      className={`h-4 w-4 ${successRate === 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
                                    />
                                    <span
                                      className={`text-sm ${successRate === 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground'}`}
                                    >
                                      {tool.toolName === UNKNOWN_VALUE
                                        ? 'Unknown Tool'
                                        : tool.toolName}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <div
                                      className={`text-sm font-medium ${successRate === 0 ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}
                                    >
                                      {successRate.toFixed(0)}%
                                    </div>
                                    <div
                                      className={`text-xs ${successRate === 0 ? 'text-red-600/80 dark:text-red-400/80' : 'text-muted-foreground'}`}
                                    >
                                      {successfulCalls}/{tool.totalCalls} calls
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}
