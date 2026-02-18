'use client';

import { AlertTriangle, ArrowRightLeft, SparklesIcon, Users, Wrench } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { AreaChartCard } from '@/components/traces/charts/area-chart-card';
import { StatCard } from '@/components/traces/charts/stat-card';
import { ConversationStatsCard } from '@/components/traces/conversation-stats/conversation-stats-card';
import { AgentFilter } from '@/components/traces/filters/agent-filter';
import { CUSTOM, DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { SpanFilters } from '@/components/traces/filters/span-filters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/external-link';
import { DOCS_BASE_URL } from '@/constants/theme';
import { useSignozConfig } from '@/hooks/use-signoz-config';
import { useConversationStats } from '@/hooks/use-traces';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { getSigNozStatsClient, type SpanFilterOptions } from '@/lib/api/signoz-stats';

// Time range options
const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export default function TracesOverview({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/traces'>) {
  const router = useRouter();
  const { tenantId, projectId } = use(params);
  const searchParams = useSearchParams();
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    agentId: selectedAgent,
    spanName,
    spanAttributes: attributes,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
    setAgentFilter: setSelectedAgent,
    setSpanFilter,
  } = useTracesQueryState();

  const mountTime = useRef(performance.now());
  const statsReadyLogged = useRef(false);
  const activityReadyLogged = useRef(false);

  useEffect(() => {
    console.log(`[traces-perf] TracesOverview mounted at t=0`);
  }, []);

  const { isLoading: isSignozConfigLoading, configError: signozConfigError } = useSignozConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activityData, setActivityData] = useState<{ date: string; count: number }[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Calculate time range based on selection
  const { startTime, endTime } = useMemo(() => {
    const currentEndTime = Date.now() - 1; // Clamp to now-1ms to satisfy backend validation

    if (selectedTimeRange === CUSTOM) {
      // Use custom dates if provided
      if (customStartDate && customEndDate) {
        // Parse the YYYY-MM-DD inputs as local dates to avoid UTC offset issues
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
        const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);

        // Clamp end to now-1ms to satisfy backend validation (end cannot be in the future)
        const clampedEndMs = Math.min(endDate.getTime(), currentEndTime);

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

    const hoursBack = TIME_RANGES[selectedTimeRange].hours;
    const calculatedStart = currentEndTime - hoursBack * 60 * 60 * 1000;

    return {
      startTime: calculatedStart,
      endTime: currentEndTime,
    };
  }, [selectedTimeRange, customStartDate, customEndDate]);
  // URL state management is now handled by useUrlFilterState hook

  // Debounce search query to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const spanFilters = useMemo<SpanFilterOptions | undefined>(() => {
    if (!spanName && attributes.length === 0) {
      return undefined;
    }
    const filters = {
      spanName: spanName || undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
    };
    return filters;
  }, [spanName, attributes]);

  const { stats, loading, error, pagination, aggregateStats } = useConversationStats({
    startTime,
    endTime,
    filters: spanFilters,
    projectId,
    tenantId,
    searchQuery: debouncedSearchQuery,
    pagination: { pageSize: 10 },
    agentId: selectedAgent,
  });

  const aggregateLoading = loading;
  const aggregateError = error;

  useEffect(() => {
    if (!loading && !statsReadyLogged.current) {
      statsReadyLogged.current = true;
      console.log(
        `[traces-perf] TracesOverview: conversation stats ready elapsed=${(performance.now() - mountTime.current).toFixed(0)}ms results=${stats.length}`
      );
    }
    if (loading) {
      statsReadyLogged.current = false;
    }
  }, [loading, stats.length]);

  useEffect(() => {
    if (!activityLoading && !activityReadyLogged.current) {
      activityReadyLogged.current = true;
      console.log(
        `[traces-perf] TracesOverview: activity chart ready elapsed=${(performance.now() - mountTime.current).toFixed(0)}ms points=${activityData.length}`
      );
    }
    if (activityLoading) {
      activityReadyLogged.current = false;
    }
  }, [activityLoading, activityData.length]);

  // Fetch conversations per day activity
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setActivityLoading(true);
        const client = getSigNozStatsClient(tenantId);
        const agentId = selectedAgent ? selectedAgent : undefined;
        console.log('🔍 Fetching activity data:', {
          startTime,
          endTime,
          agentId,
          selectedAgent,
        });
        const data = await client.getConversationsPerDay(startTime, endTime, agentId, projectId);
        console.log('🔍 Activity data received:', data);
        setActivityData(data);
      } catch (e) {
        console.error('Failed to fetch conversation activity:', e);
        setActivityData([]);
      } finally {
        setActivityLoading(false);
      }
    };
    if (startTime && endTime && tenantId) {
      fetchActivity();
    }
  }, [startTime, endTime, selectedAgent, projectId, tenantId]);

  // Filter stats based on selected agent (for aggregate calculations)
  // Server-side pagination and filtering is now handled by the hooks

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="shadow-none bg-background">
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Failed to load traces</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper functions for managing attributes
  const addAttribute = () => {
    setSpanFilter(spanName, [...attributes, { key: '', value: '', operator: '=' }]);
  };

  const removeAttribute = (index: number) => {
    setSpanFilter(
      spanName,
      attributes.filter((_, i) => i !== index)
    );
  };

  const updateAttribute = (index: number, field: 'key' | 'value' | 'operator', value: string) => {
    setSpanFilter(
      spanName,
      attributes.map((attr, i) => {
        if (i === index) {
          const updatedAttr = { ...attr, [field]: value };
          // Clear value when switching to exists/nexists operators
          if (field === 'operator' && (value === 'exists' || value === 'nexists')) {
            updatedAttr.value = '';
          }
          return updatedAttr;
        }
        return attr;
      })
    );
  };

  // Helper function to detect if a value is numeric
  const isNumeric = (value: string): boolean => {
    return !Number.isNaN(Number(value)) && value.trim() !== '';
  };

  return (
    <div className="space-y-4">
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

      <div className="flex items-center gap-4">
        {/* Agent Filter */}
        <AgentFilter onSelect={setSelectedAgent} selectedValue={selectedAgent} />
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

      <div className="flex flex-col gap-4">
        {/* Span Filter Toggle */}
        <SpanFilters
          spanName={spanName}
          setSpanFilter={setSpanFilter}
          attributes={attributes}
          addAttribute={addAttribute}
          removeAttribute={removeAttribute}
          updateAttribute={updateAttribute}
          isNumeric={isNumeric}
          selectedAgent={selectedAgent}
          tenantId={tenantId}
          projectId={projectId}
          startTime={startTime}
          endTime={endTime}
        />
      </div>

      {/* Chart and Stats in 12-column grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Conversations Activity Chart - Left side, takes 6 columns */}
        <div className="col-span-12 xl:col-span-6">
          <AreaChartCard
            chartContainerClassName="h-[250px] xl:h-100 aspect-auto  w-full"
            config={{
              count: {
                color: 'var(--chart-1)',
                label: 'Conversations',
              },
            }}
            data={activityData}
            dataKeyOne="count"
            hasError={!!aggregateError}
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
            title={`Conversations per day`}
            xAxisDataKey={'date'}
            yAxisDataKey={'count'}
            yAxisTickFormatter={(value: number | string) => value?.toLocaleString()}
          />
        </div>

        {/* Enhanced KPI Cards - Right side, takes 6 columns */}
        <div className="col-span-12 xl:col-span-6">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 gap-4 h-full">
            {/* Total MCP Tool Calls */}
            <StatCard
              title="MCP Tool calls"
              stat={aggregateStats.totalToolCalls}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={Wrench}
              onClick={() => {
                const current = new URLSearchParams(searchParams.toString());
                const href = `/${tenantId}/projects/${projectId}/traces/tool-calls?${current.toString()}`;
                router.push(href);
              }}
            />

            {/* Agent Transfers */}
            <StatCard
              title="Transfers"
              stat={aggregateStats.totalTransfers}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={Users}
            />

            {/* Agent Delegations */}
            <StatCard
              title="Delegations"
              stat={aggregateStats.totalDelegations}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={ArrowRightLeft}
            />

            {/* AI Usage */}
            <StatCard
              title="AI calls"
              stat={aggregateStats.totalAICalls}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={SparklesIcon}
              onClick={() => {
                const current = new URLSearchParams(searchParams.toString());
                const href = `/${tenantId}/projects/${projectId}/traces/ai-calls?${current.toString()}`;
                router.push(href);
              }}
            />
          </div>
        </div>
      </div>

      {/* Conversation Stats */}
      <ConversationStatsCard
        stats={stats}
        loading={loading}
        error={error}
        projectId={projectId}
        selectedTimeRange={selectedTimeRange}
        pagination={pagination}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalConversations={aggregateStats.totalConversations}
      />
    </div>
  );
}
