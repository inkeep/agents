'use client';

import { formatDateTimeTable } from '@/lib/utils/format-date';

interface LocalDateTimeTextProps {
  dateString: string;
}

export function LocalDateTimeText({ dateString }: LocalDateTimeTextProps) {
  return <>{formatDateTimeTable(dateString, { local: true })}</>;
}
