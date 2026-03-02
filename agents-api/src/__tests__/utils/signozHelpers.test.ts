import { describe, expect, it } from 'vitest';
import { enforceQuerySecurity } from '../../utils/signozHelpers';

describe('enforceQuerySecurity', () => {
  const validQuery = "SELECT * FROM t WHERE attributes_string['tenant.id'] = {{.tenant_id}}";

  it('injects tenant_id variable', () => {
    const payload = {
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.error).toBeUndefined();
    expect(result.payload.variables.tenant_id).toBe('tenant-1');
  });

  it('injects project_id variable when provided', () => {
    const payload = {
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1', 'project-1');
    expect(result.payload.variables).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'project-1',
    });
  });

  it('does not inject project_id when not provided', () => {
    const payload = {
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.payload.variables.project_id).toBeUndefined();
  });

  it('overwrites client-provided tenant_id (anti-spoofing)', () => {
    const payload = {
      variables: { tenant_id: 'attacker-tenant' },
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'legitimate-tenant');
    expect(result.payload.variables.tenant_id).toBe('legitimate-tenant');
  });

  it('overwrites client-provided project_id (anti-spoofing)', () => {
    const payload = {
      variables: { project_id: 'attacker-project' },
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1', 'real-project');
    expect(result.payload.variables.project_id).toBe('real-project');
  });

  it('initializes variables object when missing', () => {
    const payload = {
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1', 'project-1');
    expect(result.payload.variables).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'project-1',
    });
  });

  it('rejects query missing {{.tenant_id}} reference', () => {
    const payload = {
      compositeQuery: {
        chQueries: {
          malicious: {
            query: 'SELECT * FROM signoz_traces.distributed_signoz_index_v3 LIMIT 1000',
          },
        },
      },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.error).toBe('Query "malicious" is missing required {{.tenant_id}} tenant filter');
  });

  it('rejects when any one of multiple queries is missing tenant filter', () => {
    const payload = {
      compositeQuery: {
        chQueries: {
          good: { query: validQuery },
          bad: { query: 'SELECT count() FROM t' },
        },
      },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.error).toContain('bad');
  });

  it('passes when all queries reference {{.tenant_id}}', () => {
    const payload = {
      compositeQuery: {
        chQueries: {
          q1: { query: validQuery },
          q2: {
            query: `SELECT count() FROM t WHERE attributes_string['tenant.id'] = {{.tenant_id}}`,
          },
        },
      },
    };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.error).toBeUndefined();
  });

  it('passes when no chQueries present (non-clickhouse payload)', () => {
    const payload = { compositeQuery: {} };
    const result = enforceQuerySecurity(payload, 'tenant-1');
    expect(result.error).toBeUndefined();
    expect(result.payload.variables.tenant_id).toBe('tenant-1');
  });

  it('does not mutate the original payload', () => {
    const original = {
      variables: { tenant_id: 'original' },
      compositeQuery: { chQueries: { A: { query: validQuery } } },
    };
    enforceQuerySecurity(original, 'new-tenant');
    expect(original.variables.tenant_id).toBe('original');
  });
});
