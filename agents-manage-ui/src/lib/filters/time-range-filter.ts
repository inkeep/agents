/**
 * Shared time-range presets for list/analytics surfaces (evaluation results,
 * feedback, etc.). Bounds otherwise-unbounded "all time" queries with a default
 * window.
 */

const TIME_RANGE_PRESETS = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 24 * 7 },
  '15d': { label: 'Last 15 days', hours: 24 * 15 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

export const CUSTOM_RANGE = 'custom';
export const ALL_TIME = 'all';

export type TimeRangeValue =
  | keyof typeof TIME_RANGE_PRESETS
  | typeof CUSTOM_RANGE
  | typeof ALL_TIME;

/** Options for the date picker. `Custom` is appended by the picker itself. */
export const TIME_RANGE_OPTIONS = [
  ...Object.entries(TIME_RANGE_PRESETS).map(([value, config]) => ({
    value,
    label: config.label,
  })),
  { value: ALL_TIME, label: 'All time' },
];

export interface ResolvedTimeRange {
  startDate?: string;
  endDate?: string;
}

function presetStart(hours: number): Date {
  const end = new Date();
  return new Date(end.getTime() - hours * 60 * 60 * 1000);
}

/**
 * Resolve a selected time range into ISO `startDate`/`endDate` bounds.
 * Presets are relative to "now" at call time — resolve inside the data fetch
 * (not in render) to keep a rolling window. Returns `{}` for `all`/no bound.
 */
export function resolveTimeRangeISO(args: {
  timeRange: TimeRangeValue;
  customStartDate?: string;
  customEndDate?: string;
}): ResolvedTimeRange {
  const { timeRange, customStartDate, customEndDate } = args;

  if (timeRange === ALL_TIME) return {};

  if (timeRange === CUSTOM_RANGE) {
    const resolved: ResolvedTimeRange = {};
    if (customStartDate) {
      const start = new Date(`${customStartDate}T00:00:00`);
      if (!Number.isNaN(start.getTime())) resolved.startDate = start.toISOString();
    }
    if (customEndDate) {
      const end = new Date(`${customEndDate}T23:59:59.999`);
      if (!Number.isNaN(end.getTime())) resolved.endDate = end.toISOString();
    }
    return resolved;
  }

  const preset = TIME_RANGE_PRESETS[timeRange];
  if (!preset) return {};
  return { startDate: presetStart(preset.hours).toISOString(), endDate: new Date().toISOString() };
}

/** Default window for continuous tests — results accrue forever, so bound them. */
export const DEFAULT_RUN_CONFIG_TIME_RANGE: TimeRangeValue = '7d';
/** Batch jobs are inherently bounded by config id, so they default to all time. */
export const DEFAULT_JOB_CONFIG_TIME_RANGE: TimeRangeValue = ALL_TIME;
