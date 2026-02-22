/**
 * Checks if a date string is in PostgreSQL/Doltgres timestamp format and normalizes it to ISO 8601
 * PostgreSQL format: "2025-11-07 21:48:24.858" or "2025-11-07 21:48:24"
 * Doltgres may return microsecond precision: "2025-11-07 21:48:24.858000"
 * May include timezone offset: "2025-11-07 21:48:24.858+00"
 * ISO 8601 format: "2025-11-07T21:48:24.858Z"
 */
function normalizeDateString(dateString: string | Date): string | Date {
  if (typeof dateString !== 'string') {
    return dateString;
  }

  // PostgreSQL/Doltgres timestamp format pattern: YYYY-MM-DD HH:MM:SS[.fractional][±TZ]
  // Matches up to 9 fractional digits (microsecond/nanosecond precision)
  // Optionally matches timezone offset like +00, -05, +05:30
  const pgTimestampPattern =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)([+-]\d{2}(?::?\d{2})?)?$/;

  const match = dateString.match(pgTimestampPattern);
  if (match) {
    const [, datePart, timePart, tz] = match;
    // Truncate fractional seconds to 3 digits (milliseconds) for broad browser compatibility
    const normalizedTime = timePart.replace(/(\.\d{3})\d+$/, '$1');
    // If no timezone offset, treat as UTC
    if (!tz) {
      return `${datePart}T${normalizedTime}Z`;
    }
    // Normalize short offsets like +00 or -05 to full form +00:00 or -05:00
    const normalizedTz = tz === '+00' || tz === '+00:00' ? 'Z' : tz.length === 3 ? `${tz}:00` : tz;
    return `${datePart}T${normalizedTime}${normalizedTz}`;
  }

  return dateString;
}

interface FormatDateOptions {
  local?: boolean;
}

/**
 * Formats an ISO date string or PostgreSQL timestamp string as "Mon DD, YYYY", e.g. "Jan 20, 2024".
 * @param {string} dateString - An ISO‐formatted date string or PostgreSQL timestamp string, e.g. "2024-01-20T14:45:00Z" or "2025-11-07 21:48:24.858"
 * @param {FormatDateOptions} options - Pass { local: true } to format in the user's browser timezone instead of UTC
 * @returns {string} - Formatted date like "Jan 20, 2024"
 */
export function formatDate(dateString: string, options?: FormatDateOptions) {
  const normalized = normalizeDateString(dateString);
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(options?.local ? {} : { timeZone: 'UTC' }),
    });
    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export function formatDateTime(dateString: string, options?: FormatDateOptions): string {
  const normalized = normalizeDateString(dateString);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...(options?.local ? {} : { timeZone: 'UTC' }),
  }).format(date); // e.g. "Aug 28, 2024, 5:42:30 PM"
}

export function formatDateTimeTable(dateString: string, options?: FormatDateOptions): string {
  const normalized = normalizeDateString(dateString);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(options?.local ? {} : { timeZone: 'UTC' }),
  }).format(date); // e.g. "Aug 28, 2024, 5:42 PM"
}

export function formatDateAgo(dateString: string, options?: FormatDateOptions) {
  try {
    const normalized = normalizeDateString(dateString);
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      return 'Invalid date';
    }

    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();

    // Handle future dates
    if (diffInMs < 0) {
      return 'In the future';
    }

    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) {
      return 'just now';
    }
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    }
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    }
    if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    }
    if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks}w ago`;
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      ...(options?.local ? {} : { timeZone: 'UTC' }),
    });
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return 'Invalid date';
  }
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
