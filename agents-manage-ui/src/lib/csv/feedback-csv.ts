import Papa from 'papaparse';

export interface ParsedFeedbackItem {
  conversationId: string;
  type: 'positive' | 'negative';
  messageId?: string;
  details?: string;
}

export interface FeedbackCsvRowError {
  rowNumber: number;
  message: string;
}

export interface FeedbackCsvParseResult {
  items: ParsedFeedbackItem[];
  errors: FeedbackCsvRowError[];
  totalRows: number;
}

const VALID_TYPES = new Set<ParsedFeedbackItem['type']>(['positive', 'negative']);

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

function normalizeHeaderKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, '');
}

const HEADER_ALIASES: Record<string, string> = {
  conversationid: 'conversationId',
  type: 'type',
  messageid: 'messageId',
  details: 'details',
};

export function parseFeedbackCsv(csvText: string): FeedbackCsvParseResult {
  const errors: FeedbackCsvRowError[] = [];
  const items: ParsedFeedbackItem[] = [];

  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' });

  const unterminated = parsed.errors.find((e) => e.code === 'MissingQuotes');
  if (unterminated) {
    errors.push({ rowNumber: 0, message: 'Unterminated quoted field' });
    return { items, errors, totalRows: 0 };
  }

  const nonEmptyRows = parsed.data.filter((r) => !isBlankRow(r));
  if (nonEmptyRows.length === 0) {
    errors.push({ rowNumber: 1, message: 'CSV is empty' });
    return { items, errors, totalRows: 0 };
  }

  const [header, ...dataRows] = nonEmptyRows;
  const totalRows = dataRows.length;

  const columnIndex = new Map<string, number>();
  header.forEach((h, i) => {
    const normalized = normalizeHeaderKey(h);
    const canonical = HEADER_ALIASES[normalized];
    if (canonical) {
      columnIndex.set(canonical, i);
    }
  });

  const conversationIdIdx = columnIndex.get('conversationId');
  const typeIdx = columnIndex.get('type');
  const messageIdIdx = columnIndex.get('messageId');
  const detailsIdx = columnIndex.get('details');

  if (conversationIdIdx === undefined || typeIdx === undefined) {
    if (conversationIdIdx === undefined) {
      errors.push({ rowNumber: 1, message: "CSV is missing a 'conversationId' column." });
    }
    if (typeIdx === undefined) {
      errors.push({ rowNumber: 1, message: "CSV is missing a 'type' column." });
    }
    return { items: [], errors, totalRows };
  }

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const rowNumber = i + 2;

    const conversationId = row[conversationIdIdx]?.trim() ?? '';
    if (!conversationId) {
      errors.push({ rowNumber, message: 'conversationId is required' });
      continue;
    }

    const rawType = row[typeIdx]?.trim().toLowerCase() ?? '';
    if (!VALID_TYPES.has(rawType as ParsedFeedbackItem['type'])) {
      errors.push({
        rowNumber,
        message: `type must be 'positive' or 'negative', got '${rawType || '(empty)'}'`,
      });
      continue;
    }

    const cell = (idx: number | undefined) =>
      idx !== undefined ? row[idx]?.trim() || undefined : undefined;

    items.push({
      conversationId,
      type: rawType as ParsedFeedbackItem['type'],
      messageId: cell(messageIdIdx),
      details: cell(detailsIdx),
    });
  }

  return { items, errors, totalRows };
}
