'use client';

import {
  ArrowLeft,
  ArrowLeftFromLine,
  ArrowRightToLine,
  Bot,
  Coins,
  Cpu,
  FolderKanban,
  MessageSquare,
  SparklesIcon,
} from 'lucide-react';
import NextLink from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
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

  // Fetch AI calls by project
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);
        const projectIdFilter = selectedProjectId === undefined ? undefined : [selectedProjectId];

        // Fetch project stats, model breakdown, and token usage
        const [projectData, modelData, tokenData] = await Promise.all([
          client.getStatsByProject(startTime, endTime, projectIdFilter),
          client.getAICallsByModel(
            startTime,
            endTime,
            undefined,
            selectedProjectId === undefined ? undefined : selectedProjectId
          ),
          client.getTokenUsageStats(
            startTime,
            endTime,
            selectedProjectId === undefined ? undefined : selectedProjectId
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
      <div className="flex items-center gap-4 mb-6">
        <Button asChild variant="ghost" size="icon-sm">
          <NextLink href={backLink}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Stats</span>
          </NextLink>
        </Button>
        <PageHeader title="AI Calls Breakdown" className="mb-0" />
      </div>

      {/* Filters Card */}

      <div className="flex flex-col md:flex-row gap-2 md:gap-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total AI Calls"
          stat={totalAICalls}
          statDescription={
            selectedProjectId === undefined
              ? `Across ${projectStats.length} projects`
              : 'For selected project'
          }
          isLoading={loading}
          Icon={SparklesIcon}
        />

        <StatCard
          title="Total Tokens"
          stat={formatTokenCount(tokenUsage.totals.totalTokens)}
          statDescription="Input + Output tokens"
          isLoading={loading}
          Icon={Coins}
        />

        <StatCard
          title="Input Tokens"
          stat={formatTokenCount(tokenUsage.totals.inputTokens)}
          statDescription="Prompt tokens used"
          isLoading={loading}
          Icon={ArrowRightToLine}
        />

        <StatCard
          title="Output Tokens"
          stat={formatTokenCount(tokenUsage.totals.outputTokens)}
          statDescription="Completion tokens generated"
          isLoading={loading}
          Icon={ArrowLeftFromLine}
        />
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
