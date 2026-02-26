const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

export interface ParsedFreshnessDate {
  value: string;
  date: Date;
}

export interface FreshnessPairResult {
  datePublished?: ParsedFreshnessDate;
  dateModified?: ParsedFreshnessDate;
  hasDatePublished: boolean;
  hasDateModified: boolean;
  hasDatePair: boolean;
  hasDateValues: boolean;
  hasInvalidDate: boolean;
  isChronologicallyValid: boolean;
  lastModified?: string;
}

function parseDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || !ISO_DATE_PATTERN.test(trimmed)) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) {
    return undefined;
  }

  return {
    value: parsed.toISOString(),
    date: parsed,
  };
}

export function parseFreshnessMetadata(
  datePublished: string | undefined,
  dateModified: string | undefined
): FreshnessPairResult {
  const parsedPublished = parseDate(datePublished);
  const parsedModified = parseDate(dateModified);
  const hasDatePublished = Boolean(datePublished && datePublished.trim());
  const hasDateModified = Boolean(dateModified && dateModified.trim());

  const hasDatePair = hasDatePublished === hasDateModified;
  const hasDateValues = hasDatePublished || hasDateModified;
  const hasInvalidDate = hasDateValues && (!parsedPublished || !parsedModified);
  const isChronologicallyValid =
    !hasDateValues ||
    !parsedPublished ||
    !parsedModified ||
    parsedModified.date >= parsedPublished.date;

  return {
    datePublished: parsedPublished,
    dateModified: parsedModified,
    hasDatePublished,
    hasDateModified,
    hasDatePair,
    hasDateValues,
    hasInvalidDate,
    isChronologicallyValid,
    lastModified: parsedModified?.value ?? parsedPublished?.value,
  };
}

export function formatFreshnessDate(value: string | undefined) {
  const parsed = parseDate(value);
  return parsed?.value;
}
