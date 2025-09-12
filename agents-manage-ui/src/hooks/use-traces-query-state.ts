import { parseAsJson, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

// Define the time range options as a const assertion for type safety
const timeRanges = ['24h', '7d', '15d', 'custom'] as const;
export type TimeRange = (typeof timeRanges)[number];

// Type for span attributes
export interface SpanAttribute {
  key: string;
  value: string;
  operator?:
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
    | 'nexists';
}

/**
 * Hook for managing traces overview query state with nuqs
 * Provides type-safe query parameter management for:
 * - Time range selection (24h, 7d, 15d, custom)
 * - Custom date range (start/end dates)
 * - Span filtering (name and attributes)
 */
export function useTracesQueryState() {
  const [queryState, setQueryState] = useQueryStates({
    // Time range selection with default
    timeRange: parseAsStringLiteral(timeRanges).withDefault('15d'),

    // Custom date range - using descriptive names
    customStartDate: parseAsString.withDefault(''),
    customEndDate: parseAsString.withDefault(''),

    // Span filtering
    spanName: parseAsString.withDefault(''),
    spanAttributes: parseAsJson((value: unknown): SpanAttribute[] => {
      // Validate that the parsed JSON is an array of SpanAttribute objects
      if (!Array.isArray(value)) return [];

      return value.filter(
        (item): item is SpanAttribute =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as any).key === 'string' &&
          typeof (item as any).value === 'string'
      );
    }).withDefault([]),
  });

  return {
    // Current state
    timeRange: queryState.timeRange,
    customStartDate: queryState.customStartDate,
    customEndDate: queryState.customEndDate,
    spanName: queryState.spanName,
    spanAttributes: queryState.spanAttributes,

    // State setters
    setQueryState,

    // Convenience methods
    setTimeRange: (timeRange: TimeRange) => setQueryState({ timeRange }),
    setCustomDateRange: (start: string, end: string) =>
      setQueryState({ customStartDate: start, customEndDate: end }),
    setSpanFilter: (name: string, attributes: SpanAttribute[] = []) =>
      setQueryState({ spanName: name, spanAttributes: attributes }),
    clearFilters: () =>
      setQueryState({
        spanName: '',
        spanAttributes: [],
        timeRange: '15d',
        customStartDate: '',
        customEndDate: '',
      }),
  };
}
