'use client';

import { useEffect, useState } from 'react';
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
 * This avoids hydration mismatches by initially rendering in UTC (matching the
 * server-rendered HTML), then switching to local time after mount.
 *
 * Use this instead of passing `{ local: true }` directly when the component
 * receives data from a server component via props (SSR'd with server timezone).
 *
 * For components that only render after client-side data fetching (e.g. via
 * useEffect/useState), using `{ local: true }` directly is fine.
 */
function LocalDateTimeBase({ dateString, format }: { dateString: string; format: FormatFn }) {
  const fn = formatFns[format];
  const [display, setDisplay] = useState(() => fn(dateString));

  useEffect(() => {
    setDisplay(fn(dateString, { local: true }));
  }, [dateString, fn]);

  return <>{display}</>;
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
