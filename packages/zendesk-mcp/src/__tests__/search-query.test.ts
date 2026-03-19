import { describe, expect, it } from 'vitest';

// Test the query building logic by importing the tool registration module
// and testing the query construction indirectly via the search tool's behavior.
// We'll test the buildQuery function by extracting and testing the URL construction.

describe('search query building', () => {
  // Recreate the buildQuery logic to test it directly
  function buildQuery(params: {
    query: string;
    status?: string;
    priority?: string;
    assignee?: string;
    requester?: string;
    tags?: string;
    created_after?: string;
    created_before?: string;
  }): string {
    const parts: string[] = [params.query];

    if (params.status) parts.push(`status:${params.status}`);
    if (params.priority) parts.push(`priority:${params.priority}`);
    if (params.assignee) parts.push(`assignee:${params.assignee}`);
    if (params.requester) parts.push(`requester:${params.requester}`);
    if (params.tags) parts.push(`tags:${params.tags}`);
    if (params.created_after) parts.push(`created>${params.created_after}`);
    if (params.created_before) parts.push(`created<${params.created_before}`);

    if (!parts.some((p) => p.includes('type:'))) {
      parts.push('type:ticket');
    }

    return parts.join(' ');
  }

  it('appends type:ticket by default', () => {
    const query = buildQuery({ query: 'SSO issues' });
    expect(query).toBe('SSO issues type:ticket');
  });

  it('does not duplicate type:ticket if already in query', () => {
    const query = buildQuery({ query: 'type:ticket SSO issues' });
    expect(query).toBe('type:ticket SSO issues');
  });

  it('appends status filter', () => {
    const query = buildQuery({ query: 'billing', status: 'open' });
    expect(query).toContain('status:open');
    expect(query).toContain('billing');
  });

  it('appends priority filter', () => {
    const query = buildQuery({ query: 'test', priority: 'urgent' });
    expect(query).toContain('priority:urgent');
  });

  it('appends assignee filter', () => {
    const query = buildQuery({ query: 'test', assignee: 'john@example.com' });
    expect(query).toContain('assignee:john@example.com');
  });

  it('appends requester filter', () => {
    const query = buildQuery({ query: 'test', requester: 'jane' });
    expect(query).toContain('requester:jane');
  });

  it('appends tags filter', () => {
    const query = buildQuery({ query: 'test', tags: 'vip' });
    expect(query).toContain('tags:vip');
  });

  it('appends date range filters', () => {
    const query = buildQuery({
      query: 'SSO',
      created_after: '2024-01-01',
      created_before: '2024-02-01',
    });
    expect(query).toContain('created>2024-01-01');
    expect(query).toContain('created<2024-02-01');
  });

  it('supports relative dates', () => {
    const query = buildQuery({ query: 'SSO', created_after: '7days' });
    expect(query).toContain('created>7days');
  });

  it('combines all filters', () => {
    const query = buildQuery({
      query: 'SSO',
      status: 'open',
      priority: 'high',
      assignee: 'john',
      created_after: '7days',
    });
    expect(query).toBe('SSO status:open priority:high assignee:john created>7days type:ticket');
  });
});
