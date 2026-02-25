import 'dotenv/config';

const SIGNOZ_URL = 'https://inkeep.us.signoz.cloud';
const SIGNOZ_API_KEY = process.env.SIGNOZ_API_KEY;

const START = new Date('2025-01-25T00:00:00Z').getTime();
const END = Date.now();
const ENDPOINT = `${SIGNOZ_URL}/api/v4/query_range`;

const scopeFilters = [
  { key: { key: 'tenant.id', dataType: 'string', type: 'tag', isColumn: false }, op: '=', value: 'posthog' },
  { key: { key: 'project.id', dataType: 'string', type: 'tag', isColumn: false }, op: '=', value: 'content-team-project' },
  { key: { key: 'agent.id', dataType: 'string', type: 'tag', isColumn: false }, op: '=', value: 'docs-writer-agent' },
];

const aiOpFilter = {
  key: { key: 'ai.operationId', dataType: 'string', type: 'tag', isColumn: false },
  op: 'in',
  value: ['ai.generateText.doGenerate', 'ai.streamText.doStream'],
};

const groupByConversation = [{ key: 'conversation.id', dataType: 'string', type: 'tag', isColumn: false }];
const groupByModel = [{ key: 'ai.model.id', dataType: 'string', type: 'tag', isColumn: false }];
const groupByConvAndModel = [
  { key: 'conversation.id', dataType: 'string', type: 'tag', isColumn: false },
  { key: 'ai.model.id', dataType: 'string', type: 'tag', isColumn: false },
];

const payload = {
  start: START,
  end: END,
  step: 60,
  variables: {},
  compositeQuery: {
    queryType: 'builder',
    panelType: 'table',
    builderQueries: {
      allConvs: {
        dataSource: 'traces',
        queryName: 'allConvs',
        expression: 'allConvs',
        aggregateOperator: 'count',
        aggregateAttribute: {},
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters] },
        groupBy: groupByConversation,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      inputByConv: {
        dataSource: 'traces',
        queryName: 'inputByConv',
        expression: 'inputByConv',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.input_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByConversation,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      outputByConv: {
        dataSource: 'traces',
        queryName: 'outputByConv',
        expression: 'outputByConv',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.output_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByConversation,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      prToolCalls: {
        dataSource: 'traces',
        queryName: 'prToolCalls',
        expression: 'prToolCalls',
        aggregateOperator: 'count',
        aggregateAttribute: {},
        reduceTo: 'sum',
        filters: {
          op: 'AND',
          items: [
            ...scopeFilters,
            { key: { key: 'name', dataType: 'string', type: 'tag', isColumn: true }, op: '=', value: 'ai.toolCall' },
            { key: { key: 'ai.toolCall.name', dataType: 'string', type: 'tag', isColumn: false }, op: '=', value: 'create-pull-request' },
          ],
        },
        groupBy: groupByConversation,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      convStart: {
        dataSource: 'traces',
        queryName: 'convStart',
        expression: 'convStart',
        aggregateOperator: 'min',
        aggregateAttribute: { key: 'timestamp', dataType: 'float64', type: 'tag', isColumn: true, isJSON: false },
        reduceTo: 'min',
        filters: { op: 'AND', items: [...scopeFilters] },
        groupBy: groupByConversation,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      inputByModel: {
        dataSource: 'traces',
        queryName: 'inputByModel',
        expression: 'inputByModel',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.input_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByModel,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      outputByModel: {
        dataSource: 'traces',
        queryName: 'outputByModel',
        expression: 'outputByModel',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.output_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByModel,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      inputByConvModel: {
        dataSource: 'traces',
        queryName: 'inputByConvModel',
        expression: 'inputByConvModel',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.input_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByConvAndModel,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
      outputByConvModel: {
        dataSource: 'traces',
        queryName: 'outputByConvModel',
        expression: 'outputByConvModel',
        aggregateOperator: 'sum',
        aggregateAttribute: { key: 'gen_ai.usage.output_tokens', dataType: 'float64', type: 'tag', isColumn: false, isJSON: false },
        reduceTo: 'sum',
        filters: { op: 'AND', items: [...scopeFilters, aiOpFilter] },
        groupBy: groupByConvAndModel,
        stepInterval: 60,
        orderBy: [],
        offset: 0,
        disabled: false,
        having: [],
        legend: '',
        limit: 10000,
      },
    },
  },
  dataSource: 'traces',
};

type Series = { labels?: Record<string, string>; values?: Array<{ value: string }> };
type Resp = { data?: { result?: Array<{ queryName?: string; series?: Series[] }> } };

function getSeries(resp: Resp, name: string): Series[] {
  return resp?.data?.result?.find((r) => r.queryName === name)?.series ?? [];
}

function val(s: Series): number {
  let total = 0;
  for (const v of s.values ?? []) {
    const n = Number(v.value);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function weekOf(timestampNano: number): string {
  const ms = timestampNano > 1e15 ? timestampNano / 1e6 : timestampNano;
  const d = new Date(ms);
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Tenant:  posthog`);
  console.log(`Project: content-team-project`);
  console.log(`Agent:   docs-writer-agent`);
  console.log(`From:    ${new Date(START).toISOString()}`);
  console.log(`To:      ${new Date(END).toISOString()}\n`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'SIGNOZ-API-KEY': SIGNOZ_API_KEY! },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`SigNoz returned ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as Resp;

  const allConvIds = new Set<string>();
  const inputMap = new Map<string, number>();
  const outputMap = new Map<string, number>();
  const hasPR = new Set<string>();
  const startTsMap = new Map<string, number>();

  for (const s of getSeries(json, 'allConvs'))     { const id = s.labels?.['conversation.id']; if (id) allConvIds.add(id); }
  for (const s of getSeries(json, 'inputByConv'))   { const id = s.labels?.['conversation.id']; if (id) inputMap.set(id, val(s)); }
  for (const s of getSeries(json, 'outputByConv'))  { const id = s.labels?.['conversation.id']; if (id) outputMap.set(id, val(s)); }
  for (const s of getSeries(json, 'prToolCalls'))   { const id = s.labels?.['conversation.id']; if (id && val(s) > 0) hasPR.add(id); }
  for (const s of getSeries(json, 'convStart'))     { const id = s.labels?.['conversation.id']; if (id) startTsMap.set(id, val(s)); }

  console.log(`Total conversations: ${allConvIds.size}`);

  type Run = { id: string; in: number; out: number; week: string };
  const noOps: Run[] = [];
  const changes: Run[] = [];

  for (const id of allConvIds) {
    const run: Run = {
      id,
      in: inputMap.get(id) ?? 0,
      out: outputMap.get(id) ?? 0,
      week: startTsMap.has(id) ? weekOf(startTsMap.get(id)!) : 'unknown',
    };
    (hasPR.has(id) ? changes : noOps).push(run);
  }

  // build per-(conversation, model) token maps
  const convModelInput = new Map<string, Map<string, number>>();
  const convModelOutput = new Map<string, Map<string, number>>();

  for (const s of getSeries(json, 'inputByConvModel')) {
    const id = s.labels?.['conversation.id'] ?? '';
    const model = s.labels?.['ai.model.id'] ?? 'unknown';
    if (!id) continue;
    if (!convModelInput.has(id)) convModelInput.set(id, new Map());
    convModelInput.get(id)!.set(model, (convModelInput.get(id)!.get(model) ?? 0) + val(s));
  }
  for (const s of getSeries(json, 'outputByConvModel')) {
    const id = s.labels?.['conversation.id'] ?? '';
    const model = s.labels?.['ai.model.id'] ?? 'unknown';
    if (!id) continue;
    if (!convModelOutput.has(id)) convModelOutput.set(id, new Map());
    convModelOutput.get(id)!.set(model, (convModelOutput.get(id)!.get(model) ?? 0) + val(s));
  }

  function aggregateByModel(convIds: string[]): Map<string, { input: number; output: number }> {
    const result = new Map<string, { input: number; output: number }>();
    for (const id of convIds) {
      for (const [model, tokens] of convModelInput.get(id) ?? []) {
        const e = result.get(model) ?? { input: 0, output: 0 };
        e.input += tokens;
        result.set(model, e);
      }
      for (const [model, tokens] of convModelOutput.get(id) ?? []) {
        const e = result.get(model) ?? { input: 0, output: 0 };
        e.output += tokens;
        result.set(model, e);
      }
    }
    return result;
  }

  function printModelTable(models: Map<string, { input: number; output: number }>) {
    console.log('  ' + 'model'.padEnd(35) + ' |      input |     output |      total');
    console.log('  ' + '-'.repeat(83));
    for (const [model, { input: mi, output: mo }] of [...models.entries()].sort((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output))) {
      console.log(`  ${model.padEnd(35)} | ${mi.toLocaleString().padStart(10)} | ${mo.toLocaleString().padStart(10)} | ${(mi + mo).toLocaleString().padStart(10)}`);
    }
  }

  for (const [label, runs] of [['No-op (create-pull-request NOT called)', noOps], ['Changes made (create-pull-request called)', changes]] as const) {
    const totalIn = runs.reduce((s, r) => s + r.in, 0);
    const totalOut = runs.reduce((s, r) => s + r.out, 0);
    console.log(`\n=== ${label} (${runs.length} runs) ===`);
    console.log(`  Avg input:    ${runs.length ? Math.round(totalIn / runs.length).toLocaleString() : 0}`);
    console.log(`  Avg output:   ${runs.length ? Math.round(totalOut / runs.length).toLocaleString() : 0}`);
    console.log(`  Total input:  ${totalIn.toLocaleString()}`);
    console.log(`  Total output: ${totalOut.toLocaleString()}`);
    console.log(`  Total:        ${(totalIn + totalOut).toLocaleString()}`);
    console.log();
    printModelTable(aggregateByModel(runs.map((r) => r.id)));
  }

  const allModels = new Map<string, { input: number; output: number }>();
  for (const s of getSeries(json, 'inputByModel'))  { const m = s.labels?.['ai.model.id'] ?? 'unknown'; const e = allModels.get(m) ?? { input: 0, output: 0 }; e.input += val(s);  allModels.set(m, e); }
  for (const s of getSeries(json, 'outputByModel')) { const m = s.labels?.['ai.model.id'] ?? 'unknown'; const e = allModels.get(m) ?? { input: 0, output: 0 }; e.output += val(s); allModels.set(m, e); }

  console.log('\n=== By Model (all) ===');
  printModelTable(allModels);

  const weeks = new Map<string, { noOp: number; changes: number }>();
  for (const r of noOps)   { const w = weeks.get(r.week) ?? { noOp: 0, changes: 0 }; w.noOp++;    weeks.set(r.week, w); }
  for (const r of changes) { const w = weeks.get(r.week) ?? { noOp: 0, changes: 0 }; w.changes++; weeks.set(r.week, w); }

  const sorted = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));

  console.log('\n=== Weekly Volume ===');
  console.log('week                | no-op | changes | total');
  console.log('-'.repeat(55));
  let n = 0;
  for (const [key, { noOp, changes: ch }] of sorted) {
    n++;
    console.log(`Week ${n} (${key})`.padEnd(19) + ` | ${String(noOp).padStart(5)} | ${String(ch).padStart(7)} | ${String(noOp + ch).padStart(5)}`);
  }
  console.log('-'.repeat(55));
  console.log('TOTAL'.padEnd(19) + ` | ${String(noOps.length).padStart(5)} | ${String(changes.length).padStart(7)} | ${String(allConvIds.size).padStart(5)}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
