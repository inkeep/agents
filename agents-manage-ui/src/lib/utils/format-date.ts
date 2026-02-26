/**
 * Tests whether a string is parseable as a Date.
 */
function isParseableDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Normalizes a timezone offset string to ISO 8601 format.
 * +00 -> Z, -05 -> -05:00, +0530 -> +05:30, +00:00 -> Z
 */
function normalizeTzOffset(tz: string): string {
  if (/^[+-]\d{2}$/.test(tz)) return `${tz}:00`;
  if (/^[+-]\d{4}$/.test(tz)) return `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const normalized = tz;
  if (normalized === '+00:00' || normalized === '-00:00') return 'Z';
  return normalized;
}

/**
 * Normalizes a date string from any database timestamp format to a browser-parseable ISO 8601 string.
 * Handles PostgreSQL, Doltgres, and ISO 8601 formats with varying precision and timezone offsets.
 *
 * Key behaviors:
 * - Space-separated timestamps (PG format) are ALWAYS normalized to ISO with explicit UTC
 *   to avoid Node.js interpreting them as local time (which differs from browser behavior).
 * - T-separated timestamps that are already parseable are returned as-is.
 * - Short timezone offsets (+00, -05) are expanded to ISO format (+00:00, -05:00).
 * - Fractional seconds beyond 3 digits are truncated for broad browser compatibility.
 */
function normalizeDateString(dateString: string | Date): string | Date {
  if (typeof dateString !== 'string') {
    return dateString;
  }

  const trimmed = dateString.trim();
  if (!trimmed) return trimmed;

  // Match date-time strings with either space or T separator
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})([T ])(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(.*)$/);

  if (!match) {
    // Not a recognizable date-time pattern — return as-is for new Date() to attempt
    return trimmed;
  }

  const [, datePart, separator, timePart, rest] = match;
  // Truncate fractional seconds to 3 digits for broad browser compatibility
  const normalizedTime = timePart.replace(/(\.\d{3})\d+/, '$1');
  const tz = rest.trim();

  // Space-separated (PG/Doltgres format): ALWAYS normalize to avoid local-time interpretation.
  // T-separated (ISO-like): only normalize if the browser can't parse it as-is.
  const needsNormalization = separator === ' ' || !isParseableDate(trimmed);

  if (!needsNormalization) {
    return trimmed;
  }

  // Build normalized ISO string
  if (!tz) {
    // No timezone — treat as UTC (PG "timestamp without time zone" convention)
    return `${datePart}T${normalizedTime}Z`;
  }

  const normalizedTz = normalizeTzOffset(tz);
  const candidate = `${datePart}T${normalizedTime}${normalizedTz}`;
  if (isParseableDate(candidate)) return candidate;

  // Fallback: strip timezone and treat as UTC
  return `${datePart}T${normalizedTime}Z`;
}

interface FormatDateOptions {
  local?: boolean;
}

/**
 * Formats an ISO date string or PostgreSQL timestamp string as "Mon DD, YYYY", e.g. "Jan 20, 2024".
 * @param dateString - An ISO-formatted date string or PostgreSQL timestamp string
 * @param options - Pass { local: true } to format in the user's browser timezone instead of UTC
 * @returns Formatted date like "Jan 20, 2024"
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
