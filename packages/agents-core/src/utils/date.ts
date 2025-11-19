/**
 * Checks if a date string is in PostgreSQL timestamp format and normalizes it to ISO 8601
 * PostgreSQL format: "2025-11-07 21:48:24.858" or "2025-11-07 21:48:24"
 * ISO 8601 format: "2025-11-07T21:48:24.858Z"
 */
export function normalizeDateString(dateString: string | Date): string | Date {
  if (typeof dateString !== 'string') {
    return dateString;
  }

  // PostgreSQL timestamp format pattern: YYYY-MM-DD HH:MM:SS[.mmm]
  // Matches: "2025-11-07 21:48:24" or "2025-11-07 21:48:24.858"
  const pgTimestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

  if (pgTimestampPattern.test(dateString)) {
    // Replace space with 'T' and add 'Z' for UTC
    return dateString.replace(' ', 'T') + 'Z';
  }

  return dateString;
}

/**
 * Converts a date value (string or Date) to an ISO 8601 date-time string
 * Ensures consistent string output for API responses and database operations
 */
export function toISODateString(dateValue: string | Date): string {
  if (typeof dateValue === 'string') {
    const normalized = normalizeDateString(dateValue);
    return typeof normalized === 'string' ? normalized : normalized.toISOString();
  }
  return dateValue.toISOString();
}
