'use client';

import { ArrowLeft, Bot, Brain, Coins, Cpu, MessageSquare } from 'lucide-react';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { UNKNOWN_VALUE } from '@/constants/signoz';
import { type TimeRange, useAICallsQueryState } from '@/hooks/use-ai-calls-query-state';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';

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

// Time range options
const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
  custom: { label: 'Custom range', hours: 0 },
} as const;

export default function AICallsBreakdown({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/traces/ai-calls'>) {
  const { tenantId, projectId } = use(params);
  const searchParams = useSearchParams();

  const backLink = useMemo(() => {
    // Preserve the current search params when going back to traces
    const current = new URLSearchParams(searchParams.toString());
    const queryString = current.toString();

    return queryString
      ? `/${tenantId}/projects/${projectId}/traces?${queryString}`
      : `/${tenantId}/projects/${projectId}/traces`;
  }, [projectId, tenantId, searchParams]);

  // Use nuqs for type-safe query state management
  const {
    timeRange,
    customStartDate,
    customEndDate,
    selectedAgent,
    selectedModel,
    setTimeRange,
    setCustomDateRange,
    setAgentFilter,
    setModelFilter,
  } = useAICallsQueryState();
  const [agentCalls, setAgentCalls] = useState<
    {
      subAgentId: string;
      agentId: string;
      modelId: string;
      totalCalls: number;
    }[]
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
  const [agent, setAgents] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  // Handle filter changes with nuqs
  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value !== 'custom') {
      // Clear custom dates when switching away from custom
      setCustomDateRange('', '');
    }
  };

  // Calculate time range based on selection
  const { startTime, endTime } = useMemo(() => {
    const currentEndTime = Date.now();

    if (timeRange === 'custom') {
      // Use custom dates if provided
      if (customStartDate && customEndDate) {
        // Parse the YYYY-MM-DD inputs as local dates to avoid UTC offset issues
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
        const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);

        // Clamp end to now-1ms to satisfy backend validation (end cannot be in the future)
        const clampedEndMs = Math.min(endDate.getTime(), Date.now() - 1);

        return {
          startTime: startDate.getTime(),
          endTime: clampedEndMs,
        };
      }
      // Default to 30 days if custom dates not set
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

  // Fetch AI calls by agent and model
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);

        const agentId = selectedAgent === 'all' ? undefined : selectedAgent;
        const modelId = selectedModel === 'all' ? undefined : selectedModel;

        // Fetch all data in parallel using SigNoz aggregations
        const [agentData, modelData, uniqueAgents, uniqueModels, tokenData] = await Promise.all([
          client.getAICallsBySubAgent(startTime, endTime, agentId, modelId, projectId),
          client.getAICallsByModel(startTime, endTime, agentId, projectId),
          client.getUniqueAgents(startTime, endTime, projectId),
          client.getUniqueModels(startTime, endTime, projectId),
          client.getTokenUsageStats(startTime, endTime, projectId),
        ]);

        setAgentCalls(agentData);
        setModelCalls(modelData);
        setAgents(uniqueAgents);
        setModels(uniqueModels);
        setTokenUsage(tokenData);
      } catch (err) {
        console.error('Error fetching AI calls data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch AI calls data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedAgent, selectedModel, startTime, endTime, projectId, tenantId]);

  const totalAICalls = agentCalls.reduce((sum, item) => sum + item.totalCalls, 0);

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
            <span className="sr-only">Back to Traces</span>
          </NextLink>
        </Button>
        <PageHeader title="AI Calls Breakdown" className="mb-0" />
      </div>

      {/* Filters Card */}

      <div className="flex flex-col md:flex-row gap-2 md:gap-4">
        {/* Agent Filter */}
        <Combobox
          defaultValue={selectedAgent}
          notFoundMessage={'No agents found.'}
          onSelect={(value) => {
            setAgentFilter(value);
          }}
          options={agent.map((agent) => ({
            value: agent,
            label: agent,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={loading}
              filterLabel={selectedAgent === 'all' ? 'All agents' : 'Agent'}
              isRemovable={true}
              onDeleteFilter={() => {
                setAgentFilter('all');
              }}
              multipleCheckboxValues={
                selectedAgent && selectedAgent !== 'all' ? [selectedAgent] : []
              }
              options={agent.map((agent) => ({
                value: agent,
                label: agent,
              }))}
            />
          }
        />
        {/* Model Filter */}
        <Combobox
          defaultValue={selectedModel}
          notFoundMessage={'No models found.'}
          onSelect={(value) => {
            setModelFilter(value);
          }}
          options={models.map((model) => ({
            value: model,
            label: model,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={loading}
              filterLabel={selectedModel === 'all' ? 'All models' : 'Model'}
              isRemovable={true}
              onDeleteFilter={() => {
                setModelFilter('all');
              }}
              multipleCheckboxValues={
                selectedModel && selectedModel !== 'all' ? [selectedModel] : []
              }
              options={models.map((model) => ({
                value: model,
                label: model,
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
          options={Object.entries(TIME_RANGES)
            .filter(([key]) => key !== 'custom')
            .map(([value, config]) => ({
              value,
              label: config.label,
            }))}
          showCalendarDirectly={false}
        />
      </div>

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
              {selectedAgent === 'all'
                ? `Across ${agentCalls.length} agents`
                : 'For selected agent'}
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

      {/* Agent Calls List */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-foreground">AI Calls by Agent</CardTitle>
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
          ) : agentCalls.length > 0 ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {agentCalls.map((agent, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-blue-50/30 dark:bg-blue-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-blue-600" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {agent.subAgentId === UNKNOWN_VALUE ? 'Unknown Agent' : agent.subAgentId}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {agent.agentId !== UNKNOWN_VALUE && (
                          <span className="text-xs text-muted-foreground">
                            Agent: {agent.agentId}
                          </span>
                        )}
                        {agent.modelId !== UNKNOWN_VALUE && (
                          <span className="text-xs text-muted-foreground">
                            Model: {agent.modelId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">
                      {agent.totalCalls.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">AI calls</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No AI calls found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {selectedAgent === 'all'
                  ? 'No AI calls detected in the selected time range.'
                  : 'No AI calls found for the selected agent.'}
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
              {modelCalls
                .filter((model) => selectedModel === 'all' || model.modelId === selectedModel)
                .map((model, index) => (
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
                {selectedAgent === 'all'
                  ? 'No model data detected in the selected time range.'
                  : 'No model data found for the selected agent.'}
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
              {tokenUsage.byAgent.map((agentItem, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-orange-50/30 dark:bg-orange-900/20 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-orange-600" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {agentItem.agentId === UNKNOWN_VALUE ? 'Unknown Agent' : agentItem.agentId}
                      </span>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          Input:{' '}
                          <span className="text-blue-600 font-medium">
                            {formatTokenCount(agentItem.inputTokens)}
                          </span>
                        </span>
                        <span>
                          Output:{' '}
                          <span className="text-green-600 font-medium">
                            {formatTokenCount(agentItem.outputTokens)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">
                      {formatTokenCount(agentItem.totalTokens)}
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
    </div>
  );
}
