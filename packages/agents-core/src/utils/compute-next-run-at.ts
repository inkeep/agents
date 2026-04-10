import { CronExpressionParser } from 'cron-parser';

export function computeNextRunAt(params: {
  cronExpression?: string | null;
  cronTimezone?: string | null;
  runAt?: string | null;
  lastScheduledFor?: string | null;
}): string | null {
  const { cronExpression, cronTimezone, runAt, lastScheduledFor } = params;

  if (runAt && !cronExpression) {
    return runAt;
  }

  if (cronExpression) {
    const baseDate = lastScheduledFor ? new Date(lastScheduledFor) : new Date();
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: baseDate,
      tz: cronTimezone || 'UTC',
    });
    return interval.next().toISOString();
  }

  return null;
}
