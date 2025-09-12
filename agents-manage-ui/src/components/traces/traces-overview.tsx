'use client';

import {
  ArrowRightLeft,
  Filter,
  Plus,
  RefreshCw,
  SparklesIcon,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAggregateStats, useConversationStats } from '@/hooks/use-traces';
import { type TimeRange, useTracesQueryState } from '@/hooks/use-traces-query-state';
import { getSigNozStatsClient, type SpanFilterOptions } from '@/lib/api/signoz-stats';
import { AreaChartCard } from './charts/area-chart-card';
import { StatCard } from './charts/stat-card';
import { ConversationStatsCard } from './conversation-stats/conversation-stats-card';
import { CUSTOM, DatePickerWithPresets } from './filters/date-picker';
import { GraphFilter } from './filters/graph-filter';

// Time range options
const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
} as const;

interface TracesOverviewProps {
  refreshKey?: number;
}

export function TracesOverview({ refreshKey }: TracesOverviewProps) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId;
  const searchParams = useSearchParams();
  const {
    timeRange: selectedTimeRange,
    customStartDate,
    customEndDate,
    spanName,
    spanAttributes: attributes,
    setTimeRange: setSelectedTimeRange,
    setCustomDateRange,
    setSpanFilter,
  } = useTracesQueryState();

  // Track local state for show/hide span filters
  const [showSpanFilters, setShowSpanFilters] = useState(
    () => !!(spanName || (Array.isArray(attributes) && attributes.length > 0))
  );

  const [selectedGraph, setSelectedGraph] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [availableSpanNames, setAvailableSpanNames] = useState<string[]>([]);
  const [spanNamesLoading, setSpanNamesLoading] = useState(false);
  // Aggregate stats now come from useAggregateStats hook
  const [aiCallsByGraph, setAiCallsByGraph] = useState<
    Array<{ graphId: string; totalCalls: number }>
  >([]);
  const [_aiCallsLoading, setAiCallsLoading] = useState(true);
  const [activityData, setActivityData] = useState<Array<{ date: string; count: number }>>([]);
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
      } else {
        // Default to 15 days if custom dates not set
        const hoursBack = TIME_RANGES['15d'].hours;
        return {
          startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
          endTime: currentEndTime,
        };
      }
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

  // Build span filters
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

  // Get aggregate stats efficiently (server-side aggregation)
  const {
    aggregateStats,
    loading: aggregateLoading,
    error: aggregateError,
    refresh: refreshAggregateStats,
  } = useAggregateStats({
    startTime,
    endTime,
    filters: spanFilters,
    projectId: projectId as string,
  });

  // Get paginated conversations for the list display
  const { stats, loading, error, refresh, pagination } = useConversationStats({
    startTime,
    endTime,
    filters: spanFilters,
    projectId: projectId as string,
    searchQuery: debouncedSearchQuery,
    pagination: { enabled: true, pageSize: 10 },
  });

  // Server-side pagination is now handled by the hook

  // Refresh data when refreshKey changes
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      refresh();
      refreshAggregateStats();
    }
  }, [refreshKey, refresh, refreshAggregateStats]);

  // Aggregate stats now come directly from server-side aggregation

  // Fetch AI calls by graph
  useEffect(() => {
    const fetchAICallsByGraph = async () => {
      try {
        setAiCallsLoading(true);
        const client = getSigNozStatsClient();
        const aiCallsData = await client.getAICallsByGraph(startTime, endTime, projectId as string);
        setAiCallsByGraph(aiCallsData);
      } catch (err) {
        console.error('Error fetching AI calls by graph:', err);
      } finally {
        setAiCallsLoading(false);
      }
    };

    fetchAICallsByGraph();
  }, [startTime, endTime, projectId]);

  // Fetch conversations per day activity
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setActivityLoading(true);
        const client = getSigNozStatsClient();
        const graphId = selectedGraph ? selectedGraph : undefined;
        console.log('🔍 Fetching activity data:', {
          startTime,
          endTime,
          graphId,
          selectedGraph,
        });
        const data = await client.getConversationsPerDay(
          startTime,
          endTime,
          graphId,
          projectId as string
        );
        console.log('🔍 Activity data received:', data);
        setActivityData(data);
      } catch (e) {
        console.error('Failed to fetch conversation activity:', e);
        setActivityData([]);
      } finally {
        setActivityLoading(false);
      }
    };
    if (startTime && endTime) {
      fetchActivity();
    }
  }, [startTime, endTime, selectedGraph, projectId]);

  // Fetch available span names when time range or selected graph changes
  useEffect(() => {
    const fetchSpanNames = async () => {
      if (!startTime || !endTime) return;

      setSpanNamesLoading(true);
      try {
        const client = getSigNozStatsClient();
        const spanNames = await client.getAvailableSpanNames(
          startTime,
          endTime,
          selectedGraph,
          projectId as string
        );
        setAvailableSpanNames(spanNames);
      } catch (error) {
        console.error('Failed to fetch span names:', error);
        setAvailableSpanNames([]);
      } finally {
        setSpanNamesLoading(false);
      }
    };

    // Only fetch if we have valid time range
    if (startTime && endTime) {
      fetchSpanNames();
    }
  }, [startTime, endTime, selectedGraph, projectId]);

  // Filter stats based on selected graph (for aggregate calculations)
  // Server-side pagination and filtering is now handled by the hooks

  // Get AI calls for selected graph
  const selectedGraphAICalls = useMemo(() => {
    if (!selectedGraph) {
      return aggregateStats.totalAICalls;
    }
    const graphAICalls = aiCallsByGraph.find((ac) => ac.graphId === selectedGraph);
    return graphAICalls?.totalCalls || 0;
  }, [selectedGraph, aiCallsByGraph, aggregateStats.totalAICalls]);

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

  const clearSpanFilters = () => {
    setSpanFilter('', []);
    setShowSpanFilters(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Graph Filter */}
          <GraphFilter onSelect={setSelectedGraph} selectedValue={selectedGraph} />
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
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-4 max-w-3xl">
        <div className="flex flex-col md:flex-row gap-2 md:gap-0">
          {/* Filter Stats - Inline with filters */}
          {!loading && (
            <div className="flex flex-col justify-end space-y-1 text-sm text-muted-foreground min-w-fit">
              {(spanName || attributes.length > 0) && (
                <div className="flex items-center gap-1 text-xs">
                  <Filter className="h-3 w-3" />
                  Span filters active:
                  {spanName && <span className="text-muted-foreground">name={spanName}</span>}
                  {attributes.length > 0 && (
                    <span className="text-muted-foreground">
                      {attributes
                        .map((attr) => {
                          const operatorSymbol = (() => {
                            switch (attr.operator) {
                              case '!=':
                                return '!=';
                              case '<':
                                return '<';
                              case '>':
                                return '>';
                              case '<=':
                                return '≤';
                              case '>=':
                                return '≥';
                              case 'in':
                                return ' in ';
                              case 'nin':
                                return ' not in ';
                              case 'contains':
                                return ' contains ';
                              case 'ncontains':
                                return ' not contains ';
                              case 'regex':
                                return ' matches ';
                              case 'nregex':
                                return ' not matches ';
                              case 'like':
                                return ' like ';
                              case 'nlike':
                                return ' not like ';
                              case 'exists':
                                return ' exists';
                              case 'nexists':
                                return ' not exists';
                              default:
                                return '=';
                            }
                          })();
                          const valueDisplay =
                            attr.operator === 'exists' || attr.operator === 'nexists'
                              ? ''
                              : attr.value;
                          return `${attr.key}${operatorSymbol}${valueDisplay}`;
                        })
                        .join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Second Row: Span Filters */}
        <div className="flex flex-col md:flex-row gap-2 md:gap-0">
          {/* Span Filter Toggle */}
          <div className="space-y-1">
            <Label className="text-sm flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Span Filters
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant={
                  showSpanFilters || spanName || attributes.length > 0 ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => setShowSpanFilters(!showSpanFilters)}
                className="flex-1 justify-start"
              >
                <Filter className="h-4 w-4" />
                {spanName || attributes.length > 0 ? 'Filters Active' : 'Add Filters'}
              </Button>
              {(spanName || attributes.length > 0) && (
                <Button variant="ghost" size="sm" onClick={clearSpanFilters} className="p-1 h-auto">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Span Filter Configuration - Only show when toggled */}
      {showSpanFilters && (
        <div className="mt-4 p-4 border border-border rounded-lg bg-muted/50">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Span Filters</h4>
              <p className="text-xs text-muted-foreground">
                Filter conversations by span name and attributes
              </p>
            </div>

            {/* Span Name Filter */}
            <div className="space-y-1">
              <Label htmlFor="span-name" className="text-sm">
                Span Name
              </Label>
              {availableSpanNames.length > 0 ? (
                <Select
                  value={spanName || 'none'}
                  onValueChange={(value) =>
                    setSpanFilter(value === 'none' ? '' : value, attributes)
                  }
                >
                  <SelectTrigger id="span-name">
                    <SelectValue placeholder="Select span name (e.g. ai.toolCall)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No filter</SelectItem>
                    {spanNamesLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading span names...
                      </SelectItem>
                    ) : (
                      availableSpanNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="span-name"
                  placeholder="Enter span name (e.g. ai.toolCall, ai.generateText)"
                  value={spanName}
                  onChange={(e) => setSpanFilter(e.target.value, attributes)}
                  className="bg-background"
                />
              )}
              {spanNamesLoading && (
                <p className="text-xs text-muted-foreground italic">
                  Loading available span names...
                </p>
              )}
              {!spanNamesLoading && availableSpanNames.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No span names found in {selectedGraph ? `graph "${selectedGraph}"` : 'any graph'}.
                  You can type a custom span name above.
                </p>
              )}
              {!spanNamesLoading && availableSpanNames.length > 0 && selectedGraph && (
                <p className="text-xs text-muted-foreground italic">
                  Showing span names from graph "{selectedGraph}" only
                </p>
              )}
            </div>

            {/* Attributes Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Span Attributes</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAttribute}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Attribute
                </Button>
              </div>

              {attributes.map((attr, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="Attribute key (e.g. ai.agentName)"
                      value={attr.key}
                      onChange={(e) => updateAttribute(index, 'key', e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  {/* Operator selection - now available for all attribute types */}
                  <div className="w-32">
                    <Select
                      value={attr.operator || '='}
                      onValueChange={(
                        value:
                          | '='
                          | '!='
                          | '<'
                          | '>'
                          | '<='
                          | '>='
                          | 'in'
                          | 'nin'
                          | 'contains'
                          | 'ncontains'
                          | 'regex'
                          | 'nregex'
                          | 'like'
                          | 'nlike'
                          | 'exists'
                          | 'nexists'
                      ) => updateAttribute(index, 'operator', value)}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">=</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value="<=">≤</SelectItem>
                        <SelectItem value=">=">≥</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                        <SelectItem value="nin">not in</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="ncontains">not contains</SelectItem>
                        <SelectItem value="regex">regex</SelectItem>
                        <SelectItem value="nregex">not regex</SelectItem>
                        <SelectItem value="like">like</SelectItem>
                        <SelectItem value="nlike">not like</SelectItem>
                        <SelectItem value="exists">exists</SelectItem>
                        <SelectItem value="nexists">not exists</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <Input
                      placeholder={(() => {
                        const op = attr.operator || '=';
                        if (op === 'exists' || op === 'nexists') return 'No value needed';
                        if (op === 'in' || op === 'nin')
                          return 'Comma-separated values (e.g. val1,val2,val3)';
                        if (op === 'regex' || op === 'nregex') return 'Regular expression pattern';
                        if (op === 'like' || op === 'nlike')
                          return 'Pattern with % wildcards (e.g. %value%)';
                        if (op === '<' || op === '>' || op === '<=' || op === '>=')
                          return 'Numeric value';
                        return 'Attribute value (e.g. qa)';
                      })()}
                      value={attr.value}
                      onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                      className="bg-background"
                      disabled={attr.operator === 'exists' || attr.operator === 'nexists'}
                      type={
                        (attr.operator === '<' ||
                          attr.operator === '>' ||
                          attr.operator === '<=' ||
                          attr.operator === '>=') &&
                        isNumeric(attr.value)
                          ? 'number'
                          : 'text'
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeAttribute(index)}
                    className="px-2"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {attributes.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No attribute filters added. Click "Add Attribute" to filter by span attributes.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
              title="Tool Calls"
              stat={aggregateStats.totalToolCalls}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={Wrench}
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
              title="AI Calls"
              stat={selectedGraphAICalls}
              statDescription={`Over ${aggregateStats.totalConversations} conversations`}
              isLoading={aggregateLoading}
              Icon={SparklesIcon}
              onClick={() => {
                const current = new URLSearchParams(searchParams.toString());
                const href = `/${params.tenantId}/projects/${projectId}/traces/ai-calls?${current.toString()}`;
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
        projectId={projectId as string}
        selectedTimeRange={selectedTimeRange}
        pagination={pagination}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
    </div>
  );
}
