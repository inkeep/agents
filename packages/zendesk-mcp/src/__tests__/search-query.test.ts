import { describe, expect, it } from 'vitest';
import { buildQuery } from '../tools/search-tickets.js';

describe('search query building', () => {
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
