type FrequencyType = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday', short: 'Sun' },
  { value: '1', label: 'Monday', short: 'Mon' },
  { value: '2', label: 'Tuesday', short: 'Tue' },
  { value: '3', label: 'Wednesday', short: 'Wed' },
  { value: '4', label: 'Thursday', short: 'Thu' },
  { value: '5', label: 'Friday', short: 'Fri' },
  { value: '6', label: 'Saturday', short: 'Sat' },
];

export function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

export function parseCronExpression(cron: string): {
  frequency: FrequencyType;
  minuteInterval?: string;
  minute?: string;
  hour?: string;
  daysOfWeek?: string[];
  dayOfMonth?: string;
} {
  if (!cron || cron.trim() === '') {
    return { frequency: 'daily', minute: '0', hour: '9' };
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { frequency: 'custom' };
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
    const interval = minute.slice(2);
    if (/^\d+$/.test(interval) && Number(interval) >= 1 && Number(interval) <= 59) {
      return { frequency: 'minutes', minuteInterval: interval };
    }
  }

  if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*' && !minute.includes('/')) {
    return { frequency: 'hourly', minute };
  }

  if (dayOfMonth === '*' && dayOfWeek === '*' && !minute.includes('/') && !hour.includes('/')) {
    return { frequency: 'daily', minute, hour };
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*' && !minute.includes('/') && !hour.includes('/')) {
    const days = dayOfWeek.split(',').filter((d) => /^\d$/.test(d));
    if (days.length > 0) {
      return { frequency: 'weekly', minute, hour, daysOfWeek: days };
    }
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*' && !minute.includes('/') && !hour.includes('/')) {
    if (
      /^\d+$/.test(dayOfMonth) &&
      Number.parseInt(dayOfMonth, 10) >= 1 &&
      Number.parseInt(dayOfMonth, 10) <= 31
    ) {
      return { frequency: 'monthly', minute, hour, dayOfMonth };
    }
  }

  return { frequency: 'custom' };
}

export function getCronDescription(cron: string): string {
  const parsed = parseCronExpression(cron);

  switch (parsed.frequency) {
    case 'minutes':
      return `Every ${parsed.minuteInterval} min`;
    case 'hourly': {
      const min = parsed.minute?.padStart(2, '0') || '00';
      return `Hourly at :${min}`;
    }
    case 'daily': {
      const hour = Number.parseInt(parsed.hour || '9', 10);
      const min = parsed.minute?.padStart(2, '0') || '00';
      const timeStr = formatTime(hour, Number.parseInt(min, 10));
      return `Daily at ${timeStr}`;
    }
    case 'weekly': {
      const hour = Number.parseInt(parsed.hour || '9', 10);
      const min = parsed.minute?.padStart(2, '0') || '00';
      const timeStr = formatTime(hour, Number.parseInt(min, 10));
      const dayNames = parsed.daysOfWeek
        ?.map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.short)
        .filter(Boolean)
        .join(', ');
      return `${dayNames || 'Mon'} at ${timeStr}`;
    }
    case 'monthly': {
      const hour = Number.parseInt(parsed.hour || '9', 10);
      const min = parsed.minute?.padStart(2, '0') || '00';
      const timeStr = formatTime(hour, Number.parseInt(min, 10));
      const day = parsed.dayOfMonth || '1';
      return `${day}${getOrdinalSuffix(Number.parseInt(day, 10))} of month at ${timeStr}`;
    }
    default:
      return cron || 'No schedule';
  }
}
