'use client';

import { useEffect, useRef } from 'react';
import {
  formatDate,
  formatDateAgo,
  formatDateTime,
  formatDateTimeTable,
} from '@/lib/utils/format-date';

type FormatFn = 'date' | 'dateTime' | 'dateTimeTable' | 'dateAgo';

const formatFns: Record<FormatFn, (dateString: string, options?: { local?: boolean }) => string> = {
  date: formatDate,
  dateTime: formatDateTime,
  dateTimeTable: formatDateTimeTable,
  dateAgo: formatDateAgo,
};

/**
 * Client component that renders a datetime string in the user's local timezone.
 *
 * Uses suppressHydrationWarning so the client immediately renders local time
 * without waiting for a useEffect cycle. The server renders UTC (which briefly
 * appears in the initial HTML), but React replaces it with the client's local
 * time during hydration.
 *
 * Also patches the DOM via useEffect as a fallback for cases where React's
 * hydration reconciliation doesn't update the text content.
 */
function LocalDateTimeBase({ dateString, format }: { dateString: string; format: FormatFn }) {
  const fn = formatFns[format];
  const ref = useRef<HTMLSpanElement>(null);
  const localDisplay = fn(dateString, { local: true });

  // Fallback: ensure DOM is updated to local time after mount
  useEffect(() => {
    if (ref.current && ref.current.textContent !== localDisplay) {
      ref.current.textContent = localDisplay;
    }
  }, [localDisplay]);

  return (
    <span ref={ref} suppressHydrationWarning>
      {localDisplay}
    </span>
  );
}

export function LocalDate({ dateString }: { dateString: string }) {
  return <LocalDateTimeBase dateString={dateString} format="date" />;
}

export function LocalDateTime({ dateString }: { dateString: string }) {
  return <LocalDateTimeBase dateString={dateString} format="dateTime" />;
}

export function LocalDateTimeTable({ dateString }: { dateString: string }) {
  return <LocalDateTimeBase dateString={dateString} format="dateTimeTable" />;
}

export function LocalDateAgo({ dateString }: { dateString: string }) {
  return <LocalDateTimeBase dateString={dateString} format="dateAgo" />;
}
