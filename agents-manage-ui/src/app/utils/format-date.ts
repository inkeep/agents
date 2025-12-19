/**
 * Checks if a date string is in PostgreSQL timestamp format and normalizes it to ISO 8601
 * PostgreSQL format: "2025-11-07 21:48:24.858" or "2025-11-07 21:48:24"
 * ISO 8601 format: "2025-11-07T21:48:24.858Z"
 */
function normalizeDateString(dateString: string | Date): string | Date {
  if (typeof dateString !== 'string') {
    return dateString;
  }

  // PostgreSQL timestamp format pattern: YYYY-MM-DD HH:MM:SS[.mmm]
  // Matches: "2025-11-07 21:48:24" or "2025-11-07 21:48:24.858"
  const pgTimestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

  if (pgTimestampPattern.test(dateString)) {
    // Replace space with 'T' and add 'Z' for UTC
    return `${dateString.replace(' ', 'T')}Z`;
  }

  return dateString;
}

/**
 * Formats an ISO date string or PostgreSQL timestamp string as "Mon DD, YYYY", e.g. "Jan 20, 2024".
 * @param {string} dateString - An ISO‐formatted date string or PostgreSQL timestamp string, e.g. "2024-01-20T14:45:00Z" or "2025-11-07 21:48:24.858"
 * @returns {string} - Formatted date like "Jan 20, 2024"
 */
export function formatDate(dateString: string) {
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
    });
    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export function formatDateTime(dateString: string): string {
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
  }).format(date); // e.g. "Aug 28, 2024, 5:42:30 PM"
}

export function formatDateTimeTable(dateString: string): string {
  const normalized = normalizeDateString(dateString);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Invalid date';

  // Format as YYYY-MM-DD HH:mm:ss
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatDateAgo(dateString: string) {
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
    });
  } catch (error) {
    console.warn('Error formatting date:', dateString, error);
    return 'Invalid date';
  }
}

export function formatDuration(durationMs: number): string {
  const totalMinutes = Math.round(durationMs / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
