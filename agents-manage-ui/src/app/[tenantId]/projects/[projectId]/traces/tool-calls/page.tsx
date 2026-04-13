'use client';

import { ArrowLeft, CheckCircle, Wrench } from 'lucide-react';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/traces/charts/stat-card';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { FilterTriggerComponent } from '@/components/traces/filters/filter-trigger';
import { ToolCallsByServerCard } from '@/components/traces/tool-calls/tool-calls-by-server-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { type TimeRange, useToolCallsQueryState } from '@/hooks/use-tool-calls-query-state';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';
import { getTimeRangeBounds } from '@/lib/utils/time-range';

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
  const [CURRENT_TIME] = useState(() => Date.now());
  const searchParams = useSearchParams();

  const current = new URLSearchParams(searchParams.toString());
  const queryString = current.toString();

  const backLink = queryString
    ? `/${tenantId}/projects/${projectId}/traces?${queryString}`
    : `/${tenantId}/projects/${projectId}/traces`;

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

  const { startTime, endTime } = getTimeRangeBounds({
    timeRange,
    customRangeKey: CUSTOM,
    customStartDate,
    customEndDate,
    timeRanges: TIME_RANGES,
    fallbackTimeRange: '30d',
    now: CURRENT_TIME,
  });

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
      }
      setLoading(false);
    };

    fetchData();
  }, [tenantId, selectedServer, startTime, endTime, projectId]);

  const filteredToolCalls = toolCalls.filter(
    (tool) => selectedTool === 'all' || tool.toolName === selectedTool
  );
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
      <div className="flex items-center gap-4 mb-6">
        <Button asChild variant="ghost" size="icon-sm">
          <NextLink href={backLink}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Traces</span>
          </NextLink>
        </Button>
        <PageHeader title="Tool Calls Breakdown" className="mb-0" />
      </div>

      <div className="flex flex-col md:flex-row flex-wrap gap-2 md:gap-4">
        <Combobox
          defaultValue={selectedServer}
          notFoundMessage={'No MCP servers found.'}
          onSelect={(value) => {
            setServerFilter(value);
          }}
          options={servers.map((server) => ({
            value: server.name,
            label: server.id ? `${server.name} (${server.id})` : server.name,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={loading}
              filterLabel={selectedServer === 'all' ? 'All servers' : 'Server'}
              isRemovable={true}
              onDeleteFilter={() => {
                setServerFilter('all');
              }}
              multipleCheckboxValues={
                selectedServer && selectedServer !== 'all' ? [selectedServer] : []
              }
              options={servers.map((server) => ({
                value: server.name,
                label: server.id ? `${server.name} (${server.id})` : server.name,
              }))}
            />
          }
        />

        <Combobox
          defaultValue={selectedTool}
          notFoundMessage={'No tools found.'}
          onSelect={(value) => {
            setToolFilter(value);
          }}
          options={tools.map((tool) => ({
            value: tool,
            label: tool,
          }))}
          TriggerComponent={
            <FilterTriggerComponent
              disabled={loading}
              filterLabel={selectedTool === 'all' ? 'All tools' : 'Tool'}
              isRemovable={true}
              onDeleteFilter={() => {
                setToolFilter('all');
              }}
              multipleCheckboxValues={selectedTool && selectedTool !== 'all' ? [selectedTool] : []}
              options={tools.map((tool) => ({
                value: tool,
                label: tool,
              }))}
            />
          }
        />

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              title="Tool Calls"
              stat={totalToolCalls}
              statDescription="Number of tool calls"
              isLoading={loading}
              Icon={Wrench}
            />
            <StatCard
              title="Success Rate"
              stat={Number((100 - overallErrorRate).toFixed(0))}
              unit="%"
              statDescription={`${totalToolCalls - totalErrors} / ${totalToolCalls} calls successful`}
              isLoading={loading}
              Icon={CheckCircle}
            />
          </div>

          <ToolCallsByServerCard
            title="Success Rate per MCP Server"
            loading={loading}
            toolCalls={toolCalls}
            selectedServer={selectedServer}
            selectedTool={selectedTool}
            emptyMessageAll="No MCP tool calls detected in the selected time range."
            emptyMessageFiltered="No tool calls found for the selected server."
          />
        </>
      )}
    </div>
  );
}
