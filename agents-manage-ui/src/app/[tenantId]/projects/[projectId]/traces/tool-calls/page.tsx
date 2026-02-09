'use client';

import { ArrowLeft, Calendar, Server, Wrench } from 'lucide-react';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { type TimeRange, useToolCallsQueryState } from '@/hooks/use-tool-calls-query-state';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
  custom: { label: 'Custom range', hours: 0 },
} as const;

export default function ToolCallsBreakdown({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/traces/tool-calls'>) {
  const { tenantId, projectId } = use(params);
  const searchParams = useSearchParams();

  const backLink = useMemo(() => {
    const current = new URLSearchParams(searchParams.toString());
    const queryString = current.toString();

    return queryString
      ? `/${tenantId}/projects/${projectId}/traces?${queryString}`
      : `/${tenantId}/projects/${projectId}/traces`;
  }, [tenantId, projectId, searchParams]);

  const {
    timeRange,
    customStartDate,
    customEndDate,
    selectedServer,
    selectedTool,
    setTimeRange,
    setCustomDateRange,
    setServerFilter,
    setToolFilter,
  } = useToolCallsQueryState();

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
  const [servers, setServers] = useState<Array<{ name: string; id: string }>>([]);
  const [tools, setTools] = useState<string[]>([]);

  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
    if (value !== 'custom') {
      setCustomDateRange('', '');
    }
  };

  const { startTime, endTime } = useMemo(() => {
    const currentEndTime = Date.now();

    if (timeRange === 'custom') {
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);
        const serverFilter = selectedServer === 'all' ? undefined : selectedServer;

        const [toolData, uniqueServers, uniqueTools] = await Promise.all([
          client.getToolCallsByTool(startTime, endTime, serverFilter, projectId),
          client.getUniqueToolServers(startTime, endTime, projectId),
          client.getUniqueToolNames(startTime, endTime, projectId),
        ]);

        setToolCalls(toolData);
        setServers(uniqueServers);
        setTools(uniqueTools);
      } catch (err) {
        console.error('Error fetching tool calls data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch tool calls data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId, selectedServer, startTime, endTime, projectId]);

  const filteredToolCalls = useMemo(() => {
    return toolCalls.filter((tool) => selectedTool === 'all' || tool.toolName === selectedTool);
  }, [toolCalls, selectedTool]);

  const totalToolCalls = filteredToolCalls.reduce((sum, item) => sum + item.totalCalls, 0);
  const totalErrors = filteredToolCalls.reduce((sum, item) => sum + item.errorCount, 0);
  const overallErrorRate = totalToolCalls > 0 ? (totalErrors / totalToolCalls) * 100 : 0;

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <NextLink href={backLink}>
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </NextLink>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tool Calls Breakdown</h1>
          <p className="text-sm text-muted-foreground">
            Detailed view of MCP tool calls with error rates
          </p>
        </div>
      </div>

      <Card className="shadow-none bg-background">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col md:flex-row gap-2 md:gap-4 max-w-4xl">
            <div className="space-y-1 flex-1">
              <Label htmlFor="server-filter" className="text-sm">
                MCP Server
              </Label>
              <Select value={selectedServer} onValueChange={setServerFilter}>
                <SelectTrigger id="server-filter">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Servers</SelectItem>
                  {servers.map((server) => (
                    <SelectItem key={server.name} value={server.name}>
                      {server.name}
                      {server.id ? ` (${server.id})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1">
              <Label htmlFor="tool-filter" className="text-sm">
                Tool
              </Label>
              <Select value={selectedTool} onValueChange={setToolFilter}>
                <SelectTrigger id="tool-filter">
                  <SelectValue placeholder="Select tool" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tools</SelectItem>
                  {tools.map((tool) => (
                    <SelectItem key={tool} value={tool}>
                      {tool}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                options={Object.entries(TIME_RANGES)
                  .filter(([key]) => key !== 'custom')
                  .map(([value, config]) => ({
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
                {selectedServer === 'all' && selectedTool === 'all'
                  ? `Showing ${filteredToolCalls.length} tools across all servers`
                  : selectedServer === 'all'
                    ? `Showing ${filteredToolCalls.length} results filtered by tool: ${selectedTool}`
                    : selectedTool === 'all'
                      ? `Showing ${filteredToolCalls.length} tools for server: ${selectedServer}`
                      : `Showing ${filteredToolCalls.length} results for tool "${selectedTool}" and server "${selectedServer}"`}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                Time range:{' '}
                {timeRange === 'custom'
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

      {!loading &&
      filteredToolCalls.length === 0 &&
      (selectedServer !== 'all' || selectedTool !== 'all') ? (
        <Card className="shadow-none bg-background">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-lg font-medium text-foreground mb-1">
                No results match your filters
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedServer !== 'all' && selectedTool !== 'all'
                  ? `The tool "${selectedTool}" does not exist on server "${selectedServer}"`
                  : selectedServer !== 'all'
                    ? `No tools found for server "${selectedServer}"`
                    : `No results found for tool "${selectedTool}"`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-none bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">
                Total Success Rate
              </CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-32 mb-2" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                    {(100 - overallErrorRate).toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {totalToolCalls - totalErrors}/{totalToolCalls} calls successful
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none bg-background">
            <CardHeader>
              <CardTitle className="text-foreground">Success Rate per MCP Server</CardTitle>
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
                      <div className="ml-6 space-y-2">
                        {Array.from({ length: 2 }).map((_, j) => (
                          <div
                            key={j}
                            className="flex items-center justify-between p-3 bg-muted/20 rounded-md"
                          >
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                        ))}
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

                  const serverNames = Object.keys(toolsByServer)
                    .filter((name) => selectedServer === 'all' || name === selectedServer)
                    .sort((a, b) => {
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
                          {selectedServer === 'all'
                            ? 'No MCP tool calls detected in the selected time range.'
                            : 'No tool calls found for the selected server.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                      {serverNames.map((serverName) => {
                        const serverTools = toolsByServer[serverName];
                        const serverTotalCalls = serverTools.reduce(
                          (sum, t) => sum + t.totalCalls,
                          0
                        );
                        const serverTotalErrors = serverTools.reduce(
                          (sum, t) => sum + t.errorCount,
                          0
                        );
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
                                .filter(
                                  (tool) => selectedTool === 'all' || tool.toolName === selectedTool
                                )
                                .sort((a, b) => b.totalCalls - a.totalCalls)
                                .map((tool, toolIndex) => {
                                  const successfulCalls = tool.totalCalls - tool.errorCount;
                                  const successRate =
                                    tool.totalCalls > 0
                                      ? (successfulCalls / tool.totalCalls) * 100
                                      : 0;
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
        </>
      )}
    </div>
  );
}
