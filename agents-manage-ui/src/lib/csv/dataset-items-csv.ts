import Papa from 'papaparse';

type DatasetMessageRole = 'user' | 'assistant' | 'system';

type MessageContentObject = { readonly [key: string]: unknown; readonly length?: never };
type MessageContent = string | MessageContentObject;
type Message = { role: DatasetMessageRole; content: MessageContent };

export interface ParsedDatasetItem {
  input: { messages: Message[] };
  expectedOutput: Message[] | null;
}

export interface CsvRowError {
  rowNumber: number;
  message: string;
}

export interface CsvParseResult {
  items: ParsedDatasetItem[];
  errors: CsvRowError[];
  totalRows: number;
}

// ---------- Result helper ----------

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = (error: string): Err => ({ ok: false, error });

// ---------- Type guards ----------

const ROLE_VALUES: ReadonlySet<string> = new Set<DatasetMessageRole>([
  'user',
  'assistant',
  'system',
]);

function isRole(value: unknown): value is DatasetMessageRole {
  return typeof value === 'string' && ROLE_VALUES.has(value);
}

function isContentObject(value: unknown): value is MessageContentObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMessageContent(value: unknown): value is MessageContent {
  return typeof value === 'string' || isContentObject(value);
}

function hasMessagesKey(value: unknown): value is { messages: unknown } {
  return isContentObject(value) && 'messages' in value;
}

// ---------- Message validation ----------

function parseMessage(raw: unknown, index: number): Result<Message> {
  if (!isContentObject(raw)) {
    return err(`message at index ${index} is not an object`);
  }
  const { role, content } = raw as { role?: unknown; content?: unknown };
  if (!isRole(role)) {
    return err(`message at index ${index} has invalid role '${String(role)}'`);
  }
  if (!isMessageContent(content)) {
    return err(`message at index ${index} is missing or has invalid content`);
  }
  return ok({ role, content });
}

function parseMessages(raw: unknown): Result<Message[]> {
  if (!Array.isArray(raw)) return err('messages must be an array');
  const out: Message[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const r = parseMessage(raw[i], i);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

// ---------- Cell parsing ----------

interface CellOptions {
  field: string;
  defaultRole: DatasetMessageRole;
  allowEmpty: boolean;
}

/**
 * Parse a cell into a messages array. Accepts three shapes:
 *   1. Plain text  → single message with `defaultRole`
 *   2. JSON array of messages
 *   3. JSON object with a `messages` array
 *
 * Overloads narrow the return type based on `allowEmpty` so callers with
 * `allowEmpty: false` don't need a null check on `.value`.
 */
function parseMessagesCell(
  raw: string | undefined,
  opts: CellOptions & { allowEmpty: false }
): Result<Message[]>;
function parseMessagesCell(
  raw: string | undefined,
  opts: CellOptions & { allowEmpty: true }
): Result<Message[] | null>;
function parseMessagesCell(
  raw: string | undefined,
  { field, defaultRole, allowEmpty }: CellOptions
): Result<Message[] | null> {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return allowEmpty ? ok(null) : err(`${field} is required`);
  }

  // Plain text path
  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    return ok([{ role: defaultRole, content: trimmed }]);
  }

  // JSON path
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return err(`${field} is not valid JSON`);
  }

  let messagesRaw: unknown;
  if (Array.isArray(parsed)) {
    messagesRaw = parsed;
  } else if (hasMessagesKey(parsed)) {
    messagesRaw = parsed.messages;
  } else {
    return err(`${field} JSON must be an array of messages or an object with a messages array`);
  }

  const result = parseMessages(messagesRaw);
  if (!result.ok) return err(`${field}.${result.error}`);
  if (!allowEmpty && result.value.length === 0) {
    return err(`${field} must contain at least one message`);
  }
  return ok(result.value);
}

// ---------- CSV tokenizer ----------

/**
 * Tokenize CSV text
 */
function tokenizeCsv(text: string): Result<string[][]> {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  });

  const unterminated = parsed.errors.find((e) => e.code === 'MissingQuotes');
  if (unterminated) return err('Unterminated quoted field');

  return ok(parsed.data);
}

// ---------- Column resolution ----------

/**
 * Headers are matched case-insensitively but otherwise verbatim — we only
 * accept `input` (required) and `expectedOutput` (optional).
 */
const INPUT_HEADER = 'input';
const EXPECTED_HEADER = 'expectedoutput';

function normalizeHeaderKey(name: string): string {
  return name.trim().toLowerCase();
}

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

// ---------- Entry point ----------

export function parseDatasetItemsCsv(csvText: string): CsvParseResult {
  const errors: CsvRowError[] = [];
  const items: ParsedDatasetItem[] = [];

  const tokenized = tokenizeCsv(csvText);
  if (!tokenized.ok) {
    errors.push({ rowNumber: 0, message: tokenized.error });
    return { items, errors, totalRows: 0 };
  }

  const nonEmptyRows = tokenized.value.filter((r) => !isBlankRow(r));
  if (nonEmptyRows.length === 0) {
    errors.push({ rowNumber: 1, message: 'CSV is empty' });
    return { items, errors, totalRows: 0 };
  }

  const [header, ...dataRows] = nonEmptyRows;
  const totalRows = dataRows.length;

  const columnIndex = new Map<string, number>();
  header.forEach((h, i) => {
    columnIndex.set(normalizeHeaderKey(h), i);
  });

  const inputIndex = columnIndex.get(INPUT_HEADER);
  const expectedIndex = columnIndex.get(EXPECTED_HEADER);

  if (inputIndex === undefined) {
    errors.push({
      rowNumber: 1,
      message: "CSV is missing an 'input' column.",
    });
    return { items: [], errors, totalRows };
  }

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const rowNumber = i + 2;

    const input = parseMessagesCell(row[inputIndex], {
      field: 'input',
      defaultRole: 'user',
      allowEmpty: false,
    });
    if (!input.ok) {
      errors.push({ rowNumber, message: input.error });
      continue;
    }

    const expected: Result<Message[] | null> =
      expectedIndex === undefined
        ? ok(null)
        : parseMessagesCell(row[expectedIndex], {
            field: 'expectedOutput',
            defaultRole: 'assistant',
            allowEmpty: true,
          });
    if (!expected.ok) {
      errors.push({ rowNumber, message: expected.error });
      continue;
    }

    items.push({
      input: { messages: input.value },
      expectedOutput: expected.value,
    });
  }

  return { items, errors, totalRows };
}
