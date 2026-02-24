'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FrequencyType } from '@/lib/utils/cron';
import {
  DAYS_OF_WEEK,
  getCronDescription,
  getOrdinalSuffix,
  parseCronExpression,
} from '@/lib/utils/cron';

interface FriendlyScheduleBuilderProps {
  value: string;
  onChange: (cronExpression: string) => void;
  timezone?: string;
  className?: string;
}

// Helper to convert hour/minute to time string (HH:MM)
function toTimeString(hour: string, minute: string): string {
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

// Helper to parse time string (HH:MM) to hour/minute
function parseTimeString(time: string): { hour: string; minute: string } {
  const [h, m] = time.split(':');
  return {
    hour: String(Number.parseInt(h || '9', 10)),
    minute: String(Number.parseInt(m || '0', 10)),
  };
}

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
}));

// Generate cron expression from friendly values
function generateCronExpression(
  frequency: FrequencyType,
  options: {
    minuteInterval?: string;
    minute?: string;
    hour?: string;
    daysOfWeek?: string[];
    dayOfMonth?: string;
  }
): string {
  const { minuteInterval, minute = '0', hour = '9', daysOfWeek = [], dayOfMonth = '1' } = options;

  switch (frequency) {
    case 'minutes':
      return `*/${minuteInterval || '15'} * * * *`;
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly': {
      const days = daysOfWeek.length > 0 ? daysOfWeek.sort().join(',') : '1';
      return `${minute} ${hour} * * ${days}`;
    }
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return '';
  }
}

export function FriendlyScheduleBuilder({
  value,
  onChange,
  timezone = 'UTC',
  className,
}: FriendlyScheduleBuilderProps) {
  const parsed = parseCronExpression(value);

  const [frequency, setFrequency] = useState<FrequencyType>(parsed.frequency);
  const [minuteInterval, setMinuteInterval] = useState(parsed.minuteInterval || '15');
  const [minute, setMinute] = useState(parsed.minute || '0');
  const [hour, setHour] = useState(parsed.hour || '9');
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(parsed.daysOfWeek || ['1']);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth || '1');
  const [customCron, setCustomCron] = useState(parsed.frequency === 'custom' ? value : '');

  const updateCronExpression = useCallback(() => {
    if (frequency === 'custom') {
      return;
    }
    const newCron = generateCronExpression(frequency, {
      minuteInterval,
      minute,
      hour,
      daysOfWeek,
      dayOfMonth,
    });
    if (newCron !== value) {
      onChange(newCron);
    }
  }, [frequency, minuteInterval, minute, hour, daysOfWeek, dayOfMonth, value, onChange]);

  useEffect(() => {
    updateCronExpression();
  }, [updateCronExpression]);

  const handleFrequencyChange = (newFrequency: FrequencyType) => {
    setFrequency(newFrequency);
    if (newFrequency === 'custom') {
      setCustomCron(value);
    }
  };

  const handleCustomCronChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCustomCron(newValue);
    onChange(newValue);
  };

  const handleDayToggle = (day: string) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        // Don't allow removing all days
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Frequency Selection */}
      <div className="space-y-2 relative">
        <Label className="text-sm font-medium">How often?</Label>
        <Select value={frequency} onValueChange={handleFrequencyChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Every few minutes</SelectItem>
            <SelectItem value="hourly">Every hour</SelectItem>
            <SelectItem value="daily">Every day</SelectItem>
            <SelectItem value="weekly">Specific days of the week</SelectItem>
            <SelectItem value="monthly">Once a month</SelectItem>
            <SelectItem value="custom">Custom (advanced)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Minute interval selection */}
      {frequency === 'minutes' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Run every</Label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="59"
              value={minuteInterval}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || (Number(val) >= 1 && Number(val) <= 59)) {
                  setMinuteInterval(val || '1');
                }
              }}
              className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
        </div>
      )}

      {/* Hourly - minute selection */}
      {frequency === 'hourly' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">At what minute?</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">:</span>
            <input
              type="number"
              min="0"
              max="59"
              value={minute}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || (Number(val) >= 0 && Number(val) <= 59)) {
                  setMinute(val || '0');
                }
              }}
              className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <span className="text-sm text-muted-foreground">minutes past the hour</span>
          </div>
        </div>
      )}

      {/* Daily - time selection */}
      {frequency === 'daily' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">At what time?</Label>
          <input
            type="time"
            value={toTimeString(hour, minute)}
            onChange={(e) => {
              const { hour: h, minute: m } = parseTimeString(e.target.value);
              setHour(h);
              setMinute(m);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      )}

      {/* Weekly - day and time selection */}
      {frequency === 'weekly' && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium">On which days?</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleDayToggle(day.value)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    daysOfWeek.includes(day.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {day.short}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">At what time?</Label>
            <input
              type="time"
              value={toTimeString(hour, minute)}
              onChange={(e) => {
                const { hour: h, minute: m } = parseTimeString(e.target.value);
                setHour(h);
                setMinute(m);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </>
      )}

      {/* Monthly - day of month and time selection */}
      {frequency === 'monthly' && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium">On which day of the month?</Label>
            <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OF_MONTH_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">At what time?</Label>
            <input
              type="time"
              value={toTimeString(hour, minute)}
              onChange={(e) => {
                const { hour: h, minute: m } = parseTimeString(e.target.value);
                setHour(h);
                setMinute(m);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </>
      )}

      {/* Custom cron expression */}
      {frequency === 'custom' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Cron expression</Label>
          <input
            type="text"
            value={customCron}
            onChange={handleCustomCronChange}
            placeholder="e.g., 0 9 * * 1-5 (weekdays at 9 AM)"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {/* Timezone Display (read-only) */}
      {timezone && (
        <div className="space-y-1">
          <Label className="text-sm font-medium">Timezone</Label>
          <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {timezone}
          </div>
          <p className="text-xs text-muted-foreground">
            Times will be interpreted in this timezone (auto-detected from your browser)
          </p>
        </div>
      )}

      {/* Schedule Preview */}
      <div className="rounded-lg border border-border bg-muted/50 p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Preview
          </Badge>
          <span className="text-sm text-foreground">{getCronDescription(value)}</span>
        </div>
        {value && frequency !== 'custom' && (
          <p className="mt-1 text-xs text-muted-foreground font-mono">Cron: {value}</p>
        )}
      </div>
    </div>
  );
}
