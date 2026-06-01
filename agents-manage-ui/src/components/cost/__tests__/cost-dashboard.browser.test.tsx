import { cleanup, render, screen, within } from '@testing-library/react';
import {
  bucketByCacheParticipation,
  EvalCostCard,
  type StatScope,
  UsageBreakdownTable,
  UsageEventsTable,
  UsageStatCards,
} from '@/components/cost/cost-dashboard';
import '@/lib/utils/test-utils/styles.css';

const row = (overrides: {
  groupKey: string;
  totalCacheReadTokens?: number;
  totalCacheCreationTokens?: number;
  eventCount?: number;
  totalEstimatedCostUsd?: number;
  totalTokens?: number;
}) => ({
  groupKey: overrides.groupKey,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: overrides.totalTokens ?? 0,
  totalEstimatedCostUsd: overrides.totalEstimatedCostUsd ?? 0,
  eventCount: overrides.eventCount ?? 0,
  totalCacheReadTokens: overrides.totalCacheReadTokens ?? 0,
  totalCacheCreationTokens: overrides.totalCacheCreationTokens ?? 0,
});

describe('UsageBreakdownTable rendering Cost by Cache Participation', () => {
  afterEach(cleanup);

  test('renders the breakdown table with title, group label, and parallel cost/tokens/calls columns', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={bucketByCacheParticipation([
          row({
            groupKey: 'agent_generation',
            totalTokens: 10_000,
            totalEstimatedCostUsd: 0.5,
            eventCount: 4,
            totalCacheReadTokens: 6000,
          }),
          row({
            groupKey: 'distillation',
            totalTokens: 2000,
            totalEstimatedCostUsd: 0.05,
            eventCount: 2,
          }),
        ])}
        isLoading={false}
      />
    );

    expect(screen.getByText('Cost by Cache Participation')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cache Participation' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tokens' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Calls' })).toBeInTheDocument();
  });

  test('renders one row per populated cache state bucket in CACHE_PARTICIPATION_ORDER', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={bucketByCacheParticipation([
          row({
            groupKey: 'agent_generation',
            eventCount: 3,
            totalEstimatedCostUsd: 0.3,
            totalCacheReadTokens: 5000,
          }),
          row({
            groupKey: 'artifact_metadata',
            eventCount: 1,
            totalEstimatedCostUsd: 0.01,
            totalCacheCreationTokens: 200,
          }),
          row({
            groupKey: 'distillation',
            eventCount: 2,
            totalEstimatedCostUsd: 0.05,
          }),
        ])}
        isLoading={false}
      />
    );

    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows.map((r) => r.querySelector('td')?.textContent)).toEqual([
      'Cached',
      'Cache writes',
      'Uncached',
    ]);
  });

  test('omits buckets with zero events so empty cache states do not pollute the table', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={bucketByCacheParticipation([
          row({
            groupKey: 'agent_generation',
            eventCount: 3,
            totalCacheReadTokens: 5000,
          }),
        ])}
        isLoading={false}
      />
    );

    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]?.textContent).toContain('Cached');
    expect(screen.queryByText('Cache writes')).not.toBeInTheDocument();
    expect(screen.queryByText('Uncached')).not.toBeInTheDocument();
  });

  test('renders the empty-state copy when given an empty bucket list', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={bucketByCacheParticipation([])}
        isLoading={false}
      />
    );

    expect(screen.getByText(/No cost data for this period/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('renders the loading skeleton instead of the table when isLoading=true', () => {
    const { container } = render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={[]}
        isLoading={true}
      />
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('renders the error message instead of the table when error is set', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Cache Participation"
        groupLabel="Cache Participation"
        data={[]}
        isLoading={false}
        error="Failed to load cost summaries"
      />
    );

    expect(screen.getByText('Failed to load cost summaries')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('divisor prop divides cost, tokens, and calls values', () => {
    render(
      <UsageBreakdownTable
        title="Cost by Model"
        groupLabel="Model"
        data={[
          row({
            groupKey: 'claude-sonnet',
            totalEstimatedCostUsd: 1.0,
            totalTokens: 10_000,
            eventCount: 20,
          }),
        ]}
        isLoading={false}
        divisor={5}
      />
    );

    const table = screen.getByRole('table');
    const bodyRow = within(table).getAllByRole('row')[1];
    const cells = Array.from(bodyRow?.querySelectorAll('td') ?? []).map((c) => c.textContent);
    expect(cells[1]).toBe('$0.20');
    expect(cells[2]).toBe('2.0K');
    expect(cells[3]).toBe('4');
  });
});

const totals = (overrides: {
  totalTokens?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
  totalEvents?: number;
  totalCacheReadTokens?: number;
  totalCacheCreationTokens?: number;
}) => ({
  totalTokens: overrides.totalTokens ?? 0,
  totalInputTokens: overrides.totalInputTokens ?? 0,
  totalOutputTokens: overrides.totalOutputTokens ?? 0,
  totalCost: overrides.totalCost ?? 0,
  totalEvents: overrides.totalEvents ?? 0,
  totalCacheReadTokens: overrides.totalCacheReadTokens ?? 0,
  totalCacheCreationTokens: overrides.totalCacheCreationTokens ?? 0,
});

const noop = (_s: StatScope) => {};

describe('UsageStatCards rendering Cache Tokens', () => {
  afterEach(cleanup);

  test('renders a Cache Tokens card showing the formatted read-token value', () => {
    render(
      <UsageStatCards
        totals={totals({
          totalCacheReadTokens: 15_927,
          totalInputTokens: 100,
          totalOutputTokens: 50,
        })}
        conversationCount={1}
        messageCount={1}
        isLoading={false}
        scope="total"
        onScopeChange={noop}
      />
    );

    expect(screen.getByText('Cache Tokens')).toBeInTheDocument();
    expect(screen.getByText('15.9K')).toBeInTheDocument();
  });

  test('shows a "<written> written" description when creation tokens > 0', () => {
    render(
      <UsageStatCards
        totals={totals({ totalCacheReadTokens: 15_927, totalCacheCreationTokens: 5000 })}
        conversationCount={1}
        messageCount={1}
        isLoading={false}
        scope="total"
        onScopeChange={noop}
      />
    );

    expect(screen.getByText('5.0K written')).toBeInTheDocument();
  });

  test('omits the written description when creation tokens are 0', () => {
    render(
      <UsageStatCards
        totals={totals({ totalCacheReadTokens: 15_927, totalCacheCreationTokens: 0 })}
        conversationCount={1}
        messageCount={1}
        isLoading={false}
        scope="total"
        onScopeChange={noop}
      />
    );

    expect(screen.queryByText(/written/i)).not.toBeInTheDocument();
  });

  test('per-conversation scope divides cost and tokens by conversationCount', () => {
    render(
      <UsageStatCards
        totals={totals({
          totalCost: 1.0,
          totalTokens: 10_000,
          totalInputTokens: 6000,
          totalOutputTokens: 4000,
        })}
        conversationCount={5}
        messageCount={20}
        isLoading={false}
        scope="per-conversation"
        onScopeChange={noop}
      />
    );
    expect(screen.getByText('$0.20')).toBeInTheDocument();
    expect(screen.getByText('across 5 conversations')).toBeInTheDocument();
  });

  test('per-message scope divides cost and tokens by messageCount', () => {
    render(
      <UsageStatCards
        totals={totals({
          totalCost: 1.0,
          totalTokens: 10_000,
          totalInputTokens: 6000,
          totalOutputTokens: 4000,
        })}
        conversationCount={5}
        messageCount={20}
        isLoading={false}
        scope="per-message"
        onScopeChange={noop}
      />
    );
    expect(screen.getByText('$0.05')).toBeInTheDocument();
    expect(screen.getByText('across 20 messages')).toBeInTheDocument();
  });

  test('per-conversation scope with zero conversationCount falls back to divisor of 1', () => {
    render(
      <UsageStatCards
        totals={totals({ totalCost: 0.5 })}
        conversationCount={0}
        messageCount={0}
        isLoading={false}
        scope="per-conversation"
        onScopeChange={noop}
      />
    );
    expect(screen.getByText('$0.50')).toBeInTheDocument();
  });

  test('per-message scope with zero messageCount falls back to divisor of 1', () => {
    render(
      <UsageStatCards
        totals={totals({ totalCost: 0.5 })}
        conversationCount={0}
        messageCount={0}
        isLoading={false}
        scope="per-message"
        onScopeChange={noop}
      />
    );
    expect(screen.getByText('$0.50')).toBeInTheDocument();
  });

  test('renders Cost, Tokens, and Cache Tokens cards', () => {
    const { container } = render(
      <UsageStatCards
        totals={totals({ totalCacheReadTokens: 15_927 })}
        conversationCount={1}
        messageCount={1}
        isLoading={false}
        scope="total"
        onScopeChange={noop}
      />
    );

    const titles = Array.from(container.querySelectorAll('[data-slot="card-title"]')).map((el) =>
      el.textContent?.trim()
    );
    expect(titles).toEqual(['Cost', 'Tokens', 'Cache Tokens']);
  });
});

describe('EvalCostCard', () => {
  afterEach(cleanup);

  test('renders eval cost and cost per evaluation when evals ran', () => {
    render(
      <EvalCostCard
        evalSummary={{
          totalCost: 1.6,
          totalTokens: 500_000,
          evalCallCount: 8,
          conversationsEvaluated: 4,
        }}
        isLoading={false}
      />
    );
    expect(screen.getByText('Evaluation Cost')).toBeInTheDocument();
    expect(screen.getByText('$1.60')).toBeInTheDocument();
    // $1.60 / 8 eval calls = $0.20 per evaluation
    expect(screen.getByText('$0.20 per evaluation')).toBeInTheDocument();
    expect(screen.getByText('500.0K tokens')).toBeInTheDocument();
  });

  test('hides per-evaluation line when evalCallCount is zero', () => {
    render(
      <EvalCostCard
        evalSummary={{
          totalCost: 0.5,
          totalTokens: 10_000,
          evalCallCount: 0,
          conversationsEvaluated: 2,
        }}
        isLoading={false}
      />
    );
    expect(screen.getByText('$0.50')).toBeInTheDocument();
    expect(screen.queryByText(/per evaluation/)).not.toBeInTheDocument();
  });
});

const event = (overrides: {
  spanId: string;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}) => ({
  spanId: overrides.spanId,
  traceId: 'trace-1',
  timestamp: new Date('2026-05-27T00:00:00Z').toISOString(),
  generationType: 'agent_generation',
  model: 'claude-sonnet',
  provider: 'anthropic',
  agentId: '',
  subAgentId: '',
  subAgentName: '',
  conversationId: '',
  projectId: 'project-1',
  inputTokens: overrides.inputTokens ?? 800,
  outputTokens: overrides.outputTokens ?? 250,
  totalTokens: 0,
  cacheReadTokens: overrides.cacheReadTokens ?? 0,
  cacheCreationTokens: overrides.cacheCreationTokens ?? 0,
  estimatedCostUsd: 0.01,
  finishReason: 'stop',
  status: 'succeeded',
});

describe('UsageEventsTable rendering cache columns', () => {
  afterEach(cleanup);

  test('renders Cache read and Cache write headers positioned after In and before Out', () => {
    render(
      <UsageEventsTable
        tenantId="tenant-1"
        projectId="project-1"
        events={[event({ spanId: 'span-1' })]}
        isLoading={false}
        agentsById={new Map()}
      />
    );

    expect(screen.getByRole('columnheader', { name: 'Cache read' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cache write' })).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    const inIdx = headers.indexOf('In');
    const cacheReadIdx = headers.indexOf('Cache read');
    const cacheWriteIdx = headers.indexOf('Cache write');
    const outIdx = headers.indexOf('Out');
    expect(inIdx).toBeGreaterThanOrEqual(0);
    expect(cacheReadIdx).toBe(inIdx + 1);
    expect(cacheWriteIdx).toBe(cacheReadIdx + 1);
    expect(outIdx).toBe(cacheWriteIdx + 1);
  });

  test('renders the formatted cache values for a row with read/write tokens > 0', () => {
    render(
      <UsageEventsTable
        tenantId="tenant-1"
        projectId="project-1"
        events={[event({ spanId: 'span-1', cacheReadTokens: 12_000, cacheCreationTokens: 3400 })]}
        isLoading={false}
        agentsById={new Map()}
      />
    );

    const table = screen.getByRole('table');
    const bodyRow = within(table).getAllByRole('row')[1];
    const cells = Array.from(bodyRow?.querySelectorAll('td') ?? []).map((c) => c.textContent);
    // Column order: Time, Conversation, Status, Model, Provider, Cost, In, Cache read, Cache write, Out, ...
    expect(cells[7]).toBe('12.0K');
    expect(cells[8]).toBe('3.4K');
  });

  test('renders an em dash in both cache cells for a row with 0/0 cache tokens', () => {
    render(
      <UsageEventsTable
        tenantId="tenant-1"
        projectId="project-1"
        events={[event({ spanId: 'span-1', cacheReadTokens: 0, cacheCreationTokens: 0 })]}
        isLoading={false}
        agentsById={new Map()}
      />
    );

    const table = screen.getByRole('table');
    const bodyRow = within(table).getAllByRole('row')[1];
    const cells = Array.from(bodyRow?.querySelectorAll('td') ?? []).map((c) => c.textContent);
    expect(cells[7]).toBe('—');
    expect(cells[8]).toBe('—');
  });
});
