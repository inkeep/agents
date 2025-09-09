import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

// Define the time range options as a const assertion for type safety
const timeRanges = ["24h", "7d", "15d", "custom"] as const;
export type TimeRange = (typeof timeRanges)[number];

/**
 * Hook for managing AI calls breakdown query state with nuqs
 * Provides type-safe query parameter management for:
 * - Time range selection (24h, 7d, 15d, custom)
 * - Custom date range (start/end dates)
 * - Graph filtering
 * - Model filtering
 */
export function useAICallsQueryState() {
	const [queryState, setQueryState] = useQueryStates({
		// Time range selection with default
		timeRange: parseAsStringLiteral(timeRanges).withDefault("15d"),

		// Custom date range - using descriptive names instead of 'cs'/'ce'
		customStartDate: parseAsString.withDefault(""),
		customEndDate: parseAsString.withDefault(""),

		// Filtering options
		selectedGraph: parseAsString.withDefault("all"),
		selectedModel: parseAsString.withDefault("all"),
	});

	return {
		// Current state
		timeRange: queryState.timeRange,
		customStartDate: queryState.customStartDate,
		customEndDate: queryState.customEndDate,
		selectedGraph: queryState.selectedGraph,
		selectedModel: queryState.selectedModel,

		// State setters
		setQueryState,

		// Convenience methods
		setTimeRange: (timeRange: TimeRange) => setQueryState({ timeRange }),
		setCustomDateRange: (start: string, end: string) =>
			setQueryState({ customStartDate: start, customEndDate: end }),
		setGraphFilter: (graph: string) => setQueryState({ selectedGraph: graph }),
		setModelFilter: (model: string) => setQueryState({ selectedModel: model }),
		clearFilters: () =>
			setQueryState({
				selectedGraph: "all",
				selectedModel: "all",
				timeRange: "15d",
				customStartDate: "",
				customEndDate: "",
			}),
	};
}
