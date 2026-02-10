'use client';

import { formatDateTimeTable } from '@/lib/utils/format-date';

/**
 * Client component that renders a datetime string in the user's local timezone.
 * Use this when you need local time rendering inside a server component.
 */
export function LocalDateTimeTable({ dateString }: { dateString: string }) {
  return <>{formatDateTimeTable(dateString, { local: true })}</>;
}
