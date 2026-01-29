'use client';

import { ArrowLeft, Bot, Calendar, Coins, Cpu, FolderKanban, MessageSquare } from 'lucide-react';
import NextLink from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UNKNOWN_VALUE } from '@/constants/signoz';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { fetchProjectsAction } from '@/lib/actions/projects';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';
import type { Project } from '@/lib/types/project';

interface TokenUsageStats {
  byModel: Array<{
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  byAgent: Array<{
    agentId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  byProject: Array<{
    projectId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function AllProjectsAICallsBreakdown({
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
  const [modelCalls, setModelCalls] = useState<{ modelId: string; totalCalls: number }[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageStats>({
    byModel: [],
    byAgent: [],
    byProject: [],
    totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

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

  // Fetch AI calls by project
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);
        const projectIdFilter = selectedProjectId === 'all' ? undefined : [selectedProjectId];

        // Fetch project stats, model breakdown, and token usage
        const [projectData, modelData, tokenData] = await Promise.all([
          client.getStatsByProject(startTime, endTime, projectIdFilter),
          client.getAICallsByModel(
            startTime,
            endTime,
            undefined,
            selectedProjectId === 'all' ? undefined : selectedProjectId
          ),
          client.getTokenUsageStats(
            startTime,
            endTime,
            selectedProjectId === 'all' ? undefined : selectedProjectId
          ),
        ]);

        setProjectStats(projectData);
        setModelCalls(modelData);
        setTokenUsage(tokenData);
      } catch (err) {
        console.error('Error fetching AI calls data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch AI calls data');
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

  const totalAICalls = projectStats.reduce((sum, item) => sum + item.totalAICalls, 0);

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="shadow-none bg-background">
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load AI calls data</p>
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <NextLink href={backLink}>
            <ArrowLeft className="h-4 w-4" />
            Back to Stats
          </NextLink>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Calls Breakdown</h1>
          <p className="text-sm text-muted-foreground">
            Detailed view of AI calls across all projects
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="shadow-none bg-background">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col md:flex-row gap-2 md:gap-4 max-w-4xl">
            {/* Project Filter */}
            <div className="space-y-1 flex-1">
              <Label htmlFor="project-filter" className="text-sm">
                Project
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger id="project-filter">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
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
            </div>

            {/* Time Range Filter */}
            <div className="space-y-1 flex-1">
              <Label htmlFor="time-filter" className="text-sm">
                Time Range
              </Label>
              <DatePickerWithPresets
                label="Time range"
                onRemove={() => setTimeRange('30d')}
                value={
                  timeRange === CUSTOM ? { from: customStartDate, to: customEndDate } : timeRange
                }
                onAdd={(value: TimeRange) => handleTimeRangeChange(value)}
                setCustomDateRange={(start: string, end: string) => setCustomDateRange(start, end)}
                options={Object.entries(TIME_RANGES).map(([value, config]) => ({
                  value,
                  label: config.label,
                }))}
                showCalendarDirectly={false}
              />
            </div>
          </div>

          {!loading && (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <div>
                {selectedProjectId === 'all'
                  ? `Showing AI calls across ${projectStats.length} projects`
                  : `Showing AI calls for project: ${projectNameMap.get(selectedProjectId) || selectedProjectId}`}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                Time range:{' '}
                {timeRange === CUSTOM
                  ? 'Custom range'
                  : TIME_RANGES[timeRange as keyof typeof TIME_RANGES]?.label || timeRange}
                <span className="text-muted-foreground/70">
                  ({new Date(startTime).toLocaleDateString()} -{' '}
                  {new Date(endTime).toLocaleDateString()})
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total AI Calls</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20 mb-2" />
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {totalAICalls.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedProjectId === 'all'
                ? `Across ${projectStats.length} projects`
                : 'For selected project'}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total Tokens</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20 mb-2" />
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {formatTokenCount(tokenUsage.totals.totalTokens)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Input + Output tokens</p>
          </CardContent>
        </Card>

        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Input Tokens</CardTitle>
            <Coins className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20 mb-2" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">
                {formatTokenCount(tokenUsage.totals.inputTokens)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Prompt tokens used</p>
          </CardContent>
        </Card>

        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Output Tokens</CardTitle>
            <Coins className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20 mb-2" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatTokenCount(tokenUsage.totals.outputTokens)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Completion tokens generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Calls List */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">AI Calls by Project</CardTitle>
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
                .sort((a, b) => b.totalAICalls - a.totalAICalls)
                .map((project, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-blue-50/30 dark:bg-blue-900/20 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <FolderKanban className="h-5 w-5 text-blue-600" />
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
                      <div className="text-lg font-bold text-blue-600">
                        {project.totalAICalls.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">AI calls</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No AI calls found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No AI calls detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Breakdown */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">AI Calls by Model</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : modelCalls.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {modelCalls.map((model, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-green-50/30 dark:bg-green-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="h-5 w-5 text-green-600" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {model.modelId === UNKNOWN_VALUE ? 'Unknown Model' : model.modelId}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      {model.totalCalls.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">AI calls</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No model data found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No model data detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Usage by Model */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">Token Usage by Model</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : tokenUsage.byModel.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {tokenUsage.byModel.map((model, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-purple-50/30 dark:bg-purple-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="h-5 w-5 text-purple-600" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {model.modelId === UNKNOWN_VALUE ? 'Unknown Model' : model.modelId}
                      </span>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          Input:{' '}
                          <span className="text-blue-600 font-medium">
                            {formatTokenCount(model.inputTokens)}
                          </span>
                        </span>
                        <span>
                          Output:{' '}
                          <span className="text-green-600 font-medium">
                            {formatTokenCount(model.outputTokens)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-600">
                      {formatTokenCount(model.totalTokens)}
                    </div>
                    <div className="text-xs text-muted-foreground">total tokens</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No token usage data found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No token data detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Usage by Agent */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">Token Usage by Agent</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : tokenUsage.byAgent.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {tokenUsage.byAgent.map((agent, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-orange-50/30 dark:bg-orange-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-orange-600" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {agent.agentId === UNKNOWN_VALUE ? 'Unknown Agent' : agent.agentId}
                      </span>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          Input:{' '}
                          <span className="text-blue-600 font-medium">
                            {formatTokenCount(agent.inputTokens)}
                          </span>
                        </span>
                        <span>
                          Output:{' '}
                          <span className="text-green-600 font-medium">
                            {formatTokenCount(agent.outputTokens)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">
                      {formatTokenCount(agent.totalTokens)}
                    </div>
                    <div className="text-xs text-muted-foreground">total tokens</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No token usage by agent found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No agent token data detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Usage by Project */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">Token Usage by Project</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : tokenUsage.byProject.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {tokenUsage.byProject.map((project, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-cyan-50/30 dark:bg-cyan-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <FolderKanban className="h-5 w-5 text-cyan-600" />
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
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          Input:{' '}
                          <span className="text-blue-600 font-medium">
                            {formatTokenCount(project.inputTokens)}
                          </span>
                        </span>
                        <span>
                          Output:{' '}
                          <span className="text-green-600 font-medium">
                            {formatTokenCount(project.outputTokens)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-cyan-600">
                      {formatTokenCount(project.totalTokens)}
                    </div>
                    <div className="text-xs text-muted-foreground">total tokens</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No token usage by project found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No project token data detected in the selected time range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
