import {
  buildFilterExpression,
  FIELD_CONTEXTS,
  FIELD_DATA_TYPES,
  REQUEST_TYPES,
  SIGNALS,
} from '../constants/signoz-queries';

// Built-in span fields that map to fieldContext 'span'
const SPAN_BUILTIN_FIELDS = new Set([
  'spanID',
  'traceID',
  'parentSpanID',
  'name',
  'timestamp',
  'durationNano',
  'hasError',
  'statusCode',
  'statusMessage',
]);

function toFieldContext(type: string, isColumn?: boolean): string {
  if (type === 'resource') return FIELD_CONTEXTS.RESOURCE;
  if (type === 'tag' && isColumn) return FIELD_CONTEXTS.SPAN;
  return FIELD_CONTEXTS.ATTRIBUTE;
}

function toFieldDataType(dataType: string): string {
  if (dataType === 'int64') return FIELD_DATA_TYPES.INT64;
  if (dataType === 'float64') return FIELD_DATA_TYPES.FLOAT64;
  if (dataType === 'bool') return FIELD_DATA_TYPES.BOOL;
  return FIELD_DATA_TYPES.STRING;
}

export function toV5FieldKey(v4Key: {
  key: string;
  dataType?: string;
  type?: string;
  isColumn?: boolean;
}): { name: string; fieldDataType: string; fieldContext: string } {
  return {
    name: v4Key.key,
    fieldDataType: toFieldDataType(v4Key.dataType ?? 'string'),
    fieldContext: toFieldContext(v4Key.type ?? 'tag', v4Key.isColumn),
  };
}

export function toV5BuilderQuery(v4Query: any, queryName: string): any {
  const spec: any = {
    name: queryName,
    signal: SIGNALS.TRACES,
    stepInterval: v4Query.stepInterval ?? 60,
    limit: v4Query.limit ?? 10000,
    disabled: v4Query.disabled ?? false,
  };

  // Aggregations
  const op = v4Query.aggregateOperator;
  if (op && op !== 'noop') {
    const attrKey = v4Query.aggregateAttribute?.key;
    let expr: string;
    if (op === 'count') {
      expr = 'count()';
    } else if (op === 'count_distinct' && attrKey) {
      expr = `count_distinct(${attrKey})`;
    } else if (attrKey) {
      expr = `${op}(${attrKey})`;
    } else {
      expr = `${op}()`;
    }
    spec.aggregations = [{ expression: expr }];
  }

  // Filter
  const items: Array<{ key: string; op: string; value: unknown }> = (
    v4Query.filters?.items ?? []
  ).map((item: any) => ({
    key: item.key?.key ?? item.key,
    op: item.op,
    value: item.value,
  }));
  if (items.length > 0) {
    spec.filter = { expression: buildFilterExpression(items) };
  }

  // GroupBy
  if (v4Query.groupBy?.length) {
    spec.groupBy = v4Query.groupBy.map((g: any) =>
      toV5FieldKey({ key: g.key, dataType: g.dataType, type: g.type, isColumn: g.isColumn })
    );
  }

  // SelectFields (list/raw queries)
  if (v4Query.selectColumns?.length) {
    spec.selectFields = v4Query.selectColumns.map((c: any) =>
      toV5FieldKey({ key: c.key, dataType: c.dataType, type: c.type, isColumn: c.isColumn })
    );
  }

  // OrderBy → order
  if (v4Query.orderBy?.length) {
    spec.order = v4Query.orderBy.map((o: any) => ({
      key: { name: o.columnName },
      direction: o.order ?? 'desc',
    }));
  }

  return { type: 'builder_query', spec };
}

export function toV5Payload(v4Payload: any): any {
  const isListQuery =
    v4Payload.compositeQuery?.panelType === 'list' ||
    v4Payload.compositeQuery?.panelType === 'table';

  const panelType = v4Payload.compositeQuery?.panelType;
  let requestType: string;
  if (panelType === 'list') {
    requestType = REQUEST_TYPES.RAW;
  } else if (panelType === 'graph' || panelType === 'time_series' || panelType === 'bar') {
    requestType = REQUEST_TYPES.TIME_SERIES;
  } else if (panelType === 'trace') {
    requestType = REQUEST_TYPES.TRACE;
  } else {
    requestType = REQUEST_TYPES.SCALAR;
  }

  const builderQueries = v4Payload.compositeQuery?.builderQueries ?? {};
  const chQueries = v4Payload.compositeQuery?.chQueries;

  let queries: any[];
  if (chQueries) {
    queries = Object.entries(chQueries).map(([name, q]: [string, any]) => ({
      type: 'clickhouse_sql',
      spec: { name, query: q.query },
    }));
  } else {
    queries = Object.entries(builderQueries).map(([name, q]: [string, any]) =>
      toV5BuilderQuery(q, name)
    );
  }

  const v5: any = {
    start: v4Payload.start,
    end: v4Payload.end,
    requestType,
    compositeQuery: { queries },
    variables: v4Payload.variables ?? {},
  };

  if (v4Payload.projectId) v5.projectId = v4Payload.projectId;
  return v5;
}

// Response extraction helpers

export function extractV5Series(v5Response: any, queryName: string): any[] {
  if (!v5Response?.data?.results) return [];

  const result = v5Response.data.results.find((r: any) => r?.queryName === queryName);
  if (!result) return [];

  if (result.aggregations) {
    return result.aggregations.flatMap((agg: any) => agg.series ?? []);
  }

  // Scalar columnar format — convert to series-like objects
  const columns: Array<{ name: string; queryName: string; columnType: string }> =
    result.columns ?? [];
  const rows: unknown[][] = result.data ?? [];
  return rows.map((row) => {
    const labels: Record<string, string> = {};
    const values: Array<{ value: string }> = [];
    columns.forEach((col, i) => {
      if (col.columnType === 'group') {
        labels[col.name] = row[i] == null ? '' : String(row[i]);
      } else if (col.columnType === 'aggregation') {
        values.push({ value: row[i] == null ? '0' : String(row[i]) });
      }
    });
    return { labels, values };
  });
}

export function extractV5Rows(v5Response: any, queryName: string): any[] {
  return v5Response?.data?.results?.find((r: any) => r?.queryName === queryName)?.rows ?? [];
}
