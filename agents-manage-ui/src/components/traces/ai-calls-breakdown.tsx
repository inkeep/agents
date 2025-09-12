'use client';

import { ArrowLeft, Brain, Calendar, Cpu, MessageSquare } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { type TimeRange, useAICallsQueryState } from '@/hooks/use-ai-calls-query-state';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';

// Time range options
const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  custom: { label: 'Custom range', hours: 0 },
} as const;

interface AICallsBreakdownProps {
  onBack: () => void;
}

export function AICallsBreakdown({ onBack }: AICallsBreakdownProps) {
  const params = useParams();

  // Use nuqs for type-safe query state management
  const {
    timeRange,
    customStartDate,
    customEndDate,
    selectedGraph,
    selectedModel,
    setTimeRange,
    setCustomDateRange,
    setGraphFilter,
    setModelFilter,
  } = useAICallsQueryState();
  const [agentCalls, setAgentCalls] = useState<
    Array<{
      agentId: string;
      graphId: string;
      modelId: string;
      totalCalls: number;
    }>
  >([]);
  const [modelCalls, setModelCalls] = useState<Array<{ modelId: string; totalCalls: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  // Handle filter changes with nuqs
  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value !== 'custom') {
      // Clear custom dates when switching away from custom
      setCustomDateRange('', '');
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomDateRange(value, customEndDate);
    } else {
      setCustomDateRange(customStartDate, value);
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
      } else {
        // Default to 15 days if custom dates not set
        const hoursBack = TIME_RANGES['15d'].hours;
        return {
          startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
          endTime: currentEndTime,
        };
      }
    }

    const hoursBack = TIME_RANGES[timeRange].hours;
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

        const client = getSigNozStatsClient();

        const graphId = selectedGraph === 'all' ? undefined : selectedGraph;
        const modelId = selectedModel === 'all' ? undefined : selectedModel;

        // Fetch all data in parallel using SigNoz aggregations
        const [agentData, modelData, uniqueGraphs, uniqueModels] = await Promise.all([
          client.getAICallsByAgent(
            startTime,
            endTime,
            graphId,
            modelId,
            params.projectId as string
          ),
          client.getAICallsByModel(startTime, endTime, graphId, params.projectId as string),
          client.getUniqueGraphs(startTime, endTime, params.projectId as string),
          client.getUniqueModels(startTime, endTime, params.projectId as string),
        ]);

        setAgentCalls(agentData);
        setModelCalls(modelData);
        setGraphs(uniqueGraphs);
        setModels(uniqueModels);
      } catch (err) {
        console.error('Error fetching AI calls data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch AI calls data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedGraph, selectedModel, startTime, endTime, params.projectId]);

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Calls Breakdown</h1>
          <p className="text-sm text-muted-foreground">
            Detailed view of conversation-scoped AI calls by agent
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
            {/* Graph Filter */}
            <div className="space-y-1 flex-1">
              <Label htmlFor="graph-filter" className="text-sm">
                Graph
              </Label>
              <Select value={selectedGraph} onValueChange={setGraphFilter}>
                <SelectTrigger id="graph-filter">
                  <SelectValue placeholder="Select graph" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Graphs</SelectItem>
                  {graphs.map((graph) => (
                    <SelectItem key={graph} value={graph}>
                      {graph}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model Filter */}
            <div className="space-y-1 flex-1">
              <Label htmlFor="model-filter" className="text-sm">
                Model
              </Label>
              <Select value={selectedModel} onValueChange={setModelFilter}>
                <SelectTrigger id="model-filter">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range Filter */}
            <div className="space-y-1 flex-1">
              <Label htmlFor="time-filter" className="text-sm flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Time Range
              </Label>
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger id="time-filter">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIME_RANGES).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Date Inputs - Only show when Custom is selected */}
          {timeRange === 'custom' && (
            <div className="mt-4 p-4 border border-border rounded-lg bg-muted/50">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="start-date" className="text-sm">
                    Start Date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label htmlFor="end-date" className="text-sm">
                    End Date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {!loading && (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <div>
                {selectedGraph === 'all' && selectedModel === 'all'
                  ? `Showing ${agentCalls.length} agents across all graphs and models`
                  : selectedGraph === 'all'
                    ? `Showing agents for all graphs, model: ${selectedModel}`
                    : selectedModel === 'all'
                      ? `Showing agents for ${selectedGraph}, all models`
                      : `Showing agents for ${selectedGraph}, model: ${selectedModel}`}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                Time range: {TIME_RANGES[timeRange].label}
                <span className="text-muted-foreground/70">
                  ({new Date(startTime).toLocaleDateString()} -{' '}
                  {new Date(endTime).toLocaleDateString()})
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="shadow-none bg-background">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-foreground">
            Total Conversation AI Calls
          </CardTitle>
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
            {selectedGraph === 'all'
              ? `AI calls within conversations across ${agentCalls.length} agents`
              : `AI calls within conversations for selected graph`}
          </p>
        </CardContent>
      </Card>

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
                        {agent.agentId === UNKNOWN_VALUE ? 'Unknown Agent' : agent.agentId}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {agent.graphId !== UNKNOWN_VALUE && (
                          <span className="text-xs text-muted-foreground">
                            Graph: {agent.graphId}
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
              <p className="text-sm text-muted-foreground">No AI calls found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {selectedGraph === 'all'
                  ? 'No AI calls detected in the selected time range'
                  : 'No AI calls found for the selected graph'}
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
              <p className="text-sm text-muted-foreground">No model data found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {selectedGraph === 'all'
                  ? 'No model data detected in the selected time range'
                  : 'No model data found for the selected graph'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
