// SigNoz v5 API query building and response parsing utilities

// ─── V5 Request Types ───

export const V5_REQUEST_TYPES = {
  TIME_SERIES: 'time_series',
  SCALAR: 'scalar',
  RAW: 'raw',
  TRACE: 'trace',
} as const;

export const V5_QUERY_ENVELOPE_TYPES = {
  BUILDER: 'builder_query',
  CLICKHOUSE_SQL: 'clickhouse_sql',
  PROMQL: 'promql',
} as const;

// ─── V5 Types ───

export interface V5SelectField {
  name: string;
  fieldDataType?: string;
  fieldContext?: string;
}

export interface V5Aggregation {
  expression: string;
  alias?: string;
}

export interface V5GroupByKey {
  name: string;
  fieldDataType?: string;
  fieldContext?: string;
}

export interface V5OrderBy {
  key: { name: string };
  direction: string;
}

export interface V5BuilderQuerySpec {
  name: string;
  signal?: string;
  stepInterval?: number;
  aggregations?: V5Aggregation[];
  filter?: { expression: string };
  selectFields?: V5SelectField[];
  groupBy?: V5GroupByKey[];
  order?: V5OrderBy[];
  having?: { expression: string };
  disabled?: boolean;
  limit?: number | null;
  offset?: number;
}

export interface V5ChQuerySpec {
  name: string;
  query: string;
  disabled?: boolean;
}

export interface V5QueryEnvelope {
  type: string;
  spec: V5BuilderQuerySpec | V5ChQuerySpec;
}

export interface V5Payload {
  start: number;
  end: number;
  requestType: string;
  variables?: Record<string, unknown>;
  compositeQuery: {
    queries: V5QueryEnvelope[];
  };
}

// ─── V5 Response Types ───

export interface V5Label {
  key: { name: string; fieldDataType?: string; fieldContext?: string };
  value: string;
}

export interface V5SeriesValue {
  timestamp: number;
  value: number;
}

export interface V5Series {
  labels: V5Label[];
  values: V5SeriesValue[];
  predictedSeries?: unknown[];
  anomalyScores?: unknown[];
}

export interface V5AggregationBucket {
  index: number;
  alias?: string;
  series: V5Series[];
  predictedSeries?: unknown[];
  anomalyScores?: unknown[];
}

export interface V5RawRow {
  timestamp?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface V5ResultEntry {
  queryName: string;
  aggregations?: V5AggregationBucket[];
  rows?: V5RawRow[];
}

export interface V5Response {
  type?: string;
  data?: {
    results?: V5ResultEntry[];
  };
  meta?: {
    rowsScanned?: number;
    bytesScanned?: number;
    durationMs?: number;
  };
}

// ─── V5 Query Builders ───

export function v5BuilderQuery(spec: V5BuilderQuerySpec): V5QueryEnvelope {
  return {
    type: V5_QUERY_ENVELOPE_TYPES.BUILDER,
    spec: {
      signal: 'traces',
      disabled: false,
      ...spec,
    },
  };
}

export function v5ChQuery(spec: V5ChQuerySpec): V5QueryEnvelope {
  return {
    type: V5_QUERY_ENVELOPE_TYPES.CLICKHOUSE_SQL,
    spec: {
      disabled: false,
      ...spec,
    },
  };
}

export function v5Payload(options: {
  start: number;
  end: number;
  requestType: string;
  variables?: Record<string, unknown>;
  queries: V5QueryEnvelope[];
}): V5Payload {
  return {
    start: options.start,
    end: options.end,
    requestType: options.requestType,
    variables: options.variables ?? {},
    compositeQuery: {
      queries: options.queries,
    },
  };
}

// ─── Filter Expression Builder ───

type FilterItemValue = string | number | boolean | string[] | number[] | boolean[];

interface V4FilterItem {
  key: { key: string; [k: string]: unknown } | string;
  op: string;
  value: FilterItemValue;
}

function getFilterKey(item: V4FilterItem): string {
  return typeof item.key === 'string' ? item.key : item.key.key;
}

function formatFilterValue(v: string | number | boolean): string {
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  return String(v);
}

function filterItemToExpression(item: V4FilterItem): string {
  const key = getFilterKey(item);
  const op = item.op;
  const value = item.value;

  if (op === 'exists' || op === 'EXISTS') return `${key} EXISTS`;
  if (op === 'nexists' || op === 'NOT EXISTS') return `${key} NOT EXISTS`;

  if (op === 'in' || op === 'IN') {
    const values = Array.isArray(value) ? value : [value];
    const formatted = values.map((v) => formatFilterValue(v as string | number | boolean));
    return `${key} IN [${formatted.join(', ')}]`;
  }

  if (op === 'nin' || op === 'NOT IN' || op === 'not in') {
    const values = Array.isArray(value) ? value : [value];
    const formatted = values.map((v) => formatFilterValue(v as string | number | boolean));
    return `${key} NOT IN [${formatted.join(', ')}]`;
  }

  if (op === 'like' || op === 'CONTAINS' || op === 'contains') {
    return `${key} CONTAINS ${formatFilterValue(value as string)}`;
  }

  if (op === 'nlike' || op === 'NOT CONTAINS' || op === 'ncontains') {
    return `${key} NOT CONTAINS ${formatFilterValue(value as string)}`;
  }

  if (op === 'regex' || op === 'REGEXP') {
    return `${key} REGEXP ${formatFilterValue(value as string)}`;
  }

  if (op === 'nregex' || op === 'NOT REGEXP') {
    return `${key} NOT REGEXP ${formatFilterValue(value as string)}`;
  }

  return `${key} ${op} ${formatFilterValue(value as string | number | boolean)}`;
}

export function buildFilterExpression(items: V4FilterItem[]): string {
  if (items.length === 0) return '';
  return items.map(filterItemToExpression).join(' AND ');
}

export function filterExpr(expression: string): { expression: string } | undefined {
  return expression ? { expression } : undefined;
}

// ─── Convenience: selectField / groupByKey / orderBy builders ───

export function selectField(name: string, fieldDataType?: string, fieldContext?: string): V5SelectField {
  const field: V5SelectField = { name };
  if (fieldDataType) field.fieldDataType = fieldDataType;
  if (fieldContext) field.fieldContext = fieldContext;
  return field;
}

export function groupByKey(name: string, fieldDataType?: string, fieldContext?: string): V5GroupByKey {
  const key: V5GroupByKey = { name };
  if (fieldDataType) key.fieldDataType = fieldDataType;
  if (fieldContext) key.fieldContext = fieldContext;
  return key;
}

export function orderBy(name: string, direction: string = 'desc'): V5OrderBy {
  return { key: { name }, direction };
}

export function aggregation(expression: string, alias?: string): V5Aggregation {
  const agg: V5Aggregation = { expression };
  if (alias) agg.alias = alias;
  return agg;
}

// ─── V5 Response Parsers ───

export function extractV5Series(resp: V5Response, queryName: string, aggIndex = 0): V5Series[] {
  const result = resp?.data?.results?.find((r) => r?.queryName === queryName);
  return result?.aggregations?.[aggIndex]?.series ?? [];
}

export function extractV5Rows(resp: V5Response, queryName: string): V5RawRow[] {
  const result = resp?.data?.results?.find((r) => r?.queryName === queryName);
  return result?.rows ?? [];
}

export function getV5LabelValue(labels: V5Label[] | undefined, key: string): string | undefined {
  if (!labels) return undefined;
  return labels.find((l) => l.key?.name === key)?.value;
}

export function getV5LabelMap(labels: V5Label[] | undefined): Record<string, string> {
  if (!labels) return {};
  const map: Record<string, string> = {};
  for (const l of labels) {
    if (l.key?.name) map[l.key.name] = l.value;
  }
  return map;
}

export function v5SeriesCount(series: V5Series): number {
  return series.values?.[0]?.value ?? 0;
}

export function v5SeriesNumber(series: V5Series): number {
  return Number(series.values?.[0]?.value ?? 0) || 0;
}
