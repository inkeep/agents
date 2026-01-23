'use client';

import { AlertTriangle, Bot, ChevronDown, ChevronRight, FolderKanban, MessageSquare, SparklesIcon, Wrench, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink } from '@/components/ui/external-link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DOCS_BASE_URL } from '@/constants/theme';
import { useSignozConfig } from '@/hooks/use-signoz-config';
import {
  useConversationsPerDayAcrossProjects,
  useProjectOverviewStats,
  useStatsByProject,
} from '@/hooks/use-traces';
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

export default function ProjectsStatsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
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
      const hoursBack = TIME_RANGES['15d'].hours;
      return {
        startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
        endTime: currentEndTime,
      };
    }

    const hoursBack = TIME_RANGES[selectedTimeRange as keyof typeof TIME_RANGES]?.hours || TIME_RANGES['15d'].hours;
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

  const {
    data: activityData,
    loading: activityLoading,
  } = useConversationsPerDayAcrossProjects({
    startTime,
    endTime,
    projectIds,
    tenantId,
  });

  const {
    data: projectStats,
    loading: projectStatsLoading,
  } = useStatsByProject({
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

  // State for expanded projects and agent data
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [agentDataByProject, setAgentDataByProject] = useState<
    Map<string, Array<{ agentId: string; conversationCount: number }>>
  >(new Map());
  const [loadingAgentData, setLoadingAgentData] = useState<Set<string>>(new Set());

  // Fetch agent data when a project is expanded
  const handleProjectToggle = async (projectId: string, isOpen: boolean) => {
    if (isOpen) {
      setExpandedProjects((prev) => new Set(prev).add(projectId));

      // Fetch agent data if not already loaded
      if (!agentDataByProject.has(projectId) && !loadingAgentData.has(projectId)) {
        setLoadingAgentData((prev) => new Set(prev).add(projectId));
        try {
          const client = getSigNozStatsClient(tenantId);
          const agentData = await client.getConversationsByAgent(startTime, endTime, projectId);
          setAgentDataByProject((prev) => new Map(prev).set(projectId, agentData));
        } catch (err) {
          console.error('Error fetching agent data for project:', projectId, err);
          setAgentDataByProject((prev) => new Map(prev).set(projectId, []));
        } finally {
          setLoadingAgentData((prev) => {
            const next = new Set(prev);
            next.delete(projectId);
            return next;
          });
        }
      }
    } else {
      setExpandedProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

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
        <Select
          value={selectedProjectId || 'all'}
          onValueChange={(value) => setSelectedProjectId(value === 'all' ? undefined : value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectsLoading ? (
              <SelectItem value="loading" disabled>
                Loading...
              </SelectItem>
            ) : (
              projects.map((project) => (
                <SelectItem key={project.projectId} value={project.projectId}>
                  {project.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* Time Range Filter */}
        <DatePickerWithPresets
          label="Time range"
          onRemove={() => setSelectedTimeRange('15d')}
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
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {projectStatsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : projectStats.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No project data available for the selected time range.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {[...projectStats]
                  .sort((a, b) => b.totalConversations - a.totalConversations)
                  .map((stat) => {
                    const isExpanded = expandedProjects.has(stat.projectId);
                    const isLoadingAgents = loadingAgentData.has(stat.projectId);
                    const agents = agentDataByProject.get(stat.projectId) || [];

                    return (
                      <Collapsible
                        key={stat.projectId}
                        open={isExpanded}
                        onOpenChange={(open) => handleProjectToggle(stat.projectId, open)}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 rounded-lg border border-border transition-colors cursor-pointer">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <FolderKanban className="h-5 w-5 text-blue-600" />
                              <span className="font-medium text-foreground">
                                {projectNameMap.get(stat.projectId) || stat.projectId}
                              </span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="text-lg font-bold text-blue-600">
                                  {stat.totalConversations.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">conversations</div>
                              </div>
                              <div className="text-right hidden sm:block">
                                <div className="text-sm font-medium text-muted-foreground">
                                  {stat.totalAICalls.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">AI calls</div>
                              </div>
                              <div className="text-right hidden sm:block">
                                <div className="text-sm font-medium text-muted-foreground">
                                  {stat.totalMCPCalls.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">MCP calls</div>
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-8 mt-2 pb-2">
                            {isLoadingAgents ? (
                              <div className="space-y-2 py-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                              </div>
                            ) : agents.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-4 text-center">
                                No agent data available
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                {agents.map((agent) => (
                                  <div
                                    key={agent.agentId}
                                    className="flex items-center justify-between p-3 bg-background rounded-md border border-border/50"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Bot className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm text-foreground">{agent.agentId}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-sm font-medium text-foreground">
                                        {agent.conversationCount.toLocaleString()}
                                      </span>
                                      <span className="text-xs text-muted-foreground ml-1">
                                        conversations
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

