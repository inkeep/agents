interface TimeRangeDefinition {
  hours: number;
}

interface GetTimeRangeBoundsParams {
  timeRange: string;
  customRangeKey: string;
  customStartDate?: string;
  customEndDate?: string;
  timeRanges: Record<string, TimeRangeDefinition>;
  fallbackTimeRange: string;
  now?: number;
}

export function getTimeRangeBounds({
  timeRange,
  customRangeKey,
  customStartDate,
  customEndDate,
  timeRanges,
  fallbackTimeRange,
  now = Date.now(),
}: GetTimeRangeBoundsParams) {
  const currentEndTime = now - 1;

  if (timeRange === customRangeKey) {
    if (customStartDate && customEndDate) {
      const [sy, sm, sd] = customStartDate.split('-').map(Number);
      const [ey, em, ed] = customEndDate.split('-').map(Number);
      const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
      const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);

      return {
        startTime: startDate.getTime(),
        endTime: Math.min(endDate.getTime(), currentEndTime),
      };
    }
  }

  const selectedRange = timeRanges[timeRange] ?? timeRanges[fallbackTimeRange];
  const hoursBack = selectedRange?.hours ?? 24 * 30;

  return {
    startTime: currentEndTime - hoursBack * 60 * 60 * 1000,
    endTime: currentEndTime,
  };
}
