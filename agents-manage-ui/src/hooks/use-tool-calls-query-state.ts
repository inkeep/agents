import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const timeRanges = ['24h', '7d', '15d', '30d', 'custom'] as const;
export type TimeRange = (typeof timeRanges)[number];

export function useToolCallsQueryState() {
  const [queryState, setQueryState] = useQueryStates({
    timeRange: parseAsStringLiteral(timeRanges).withDefault('30d'),
    customStartDate: parseAsString.withDefault(''),
    customEndDate: parseAsString.withDefault(''),
    selectedServer: parseAsString.withDefault('all'),
    selectedTool: parseAsString.withDefault('all'),
  });

  return {
    timeRange: queryState.timeRange,
    customStartDate: queryState.customStartDate,
    customEndDate: queryState.customEndDate,
    selectedServer: queryState.selectedServer,
    selectedTool: queryState.selectedTool,

    setQueryState,

    setTimeRange: (timeRange: TimeRange) => setQueryState({ timeRange }),
    setCustomDateRange: (start: string, end: string) =>
      setQueryState({ customStartDate: start, customEndDate: end }),
    setServerFilter: (server: string) => setQueryState({ selectedServer: server }),
    setToolFilter: (tool: string) => setQueryState({ selectedTool: tool }),
    clearFilters: () =>
      setQueryState({
        selectedServer: 'all',
        selectedTool: 'all',
        timeRange: '30d',
        customStartDate: '',
        customEndDate: '',
      }),
  };
}
