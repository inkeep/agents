import { describe, expect, it } from 'vitest';
import { evaluatePassCriteria } from '../pass-criteria-evaluator';

describe('evaluatePassCriteria', () => {
  it('returns no_criteria when criteria is null or empty', () => {
    expect(evaluatePassCriteria(null, { score: 0.8 }).status).toBe('no_criteria');
    expect(evaluatePassCriteria(undefined, { score: 0.8 }).status).toBe('no_criteria');
    expect(evaluatePassCriteria({ operator: 'and', conditions: [] }, { score: 0.8 }).status).toBe(
      'no_criteria'
    );
  });

  it('flat AND: passes when all pass, fails when any fails', () => {
    const criteria = {
      operator: 'and' as const,
      conditions: [
        { field: 'accuracy', operator: '>=' as const, value: 0.7 },
        { field: 'length', operator: '>' as const, value: 5 },
      ],
    };
    expect(evaluatePassCriteria(criteria, { accuracy: 0.9, length: 10 }).status).toBe('passed');
    const failed = evaluatePassCriteria(criteria, { accuracy: 0.3, length: 10 });
    expect(failed.status).toBe('failed');
    expect(failed.failedConditions).toEqual([{ field: 'accuracy', operator: '>=', value: 0.7 }]);
  });

  it.each([
    { operator: '>' as const, value: 5, passing: 6, failing: 5 },
    { operator: '<' as const, value: 5, passing: 4, failing: 5 },
    { operator: '>=' as const, value: 5, passing: 5, failing: 4 },
    { operator: '<=' as const, value: 5, passing: 5, failing: 6 },
    { operator: '=' as const, value: 5, passing: 5, failing: 4 },
    { operator: '!=' as const, value: 5, passing: 4, failing: 5 },
  ])('numeric operator $operator: boundary pass/fail', ({ operator, value, passing, failing }) => {
    const make = (val: number) =>
      evaluatePassCriteria(
        { operator: 'and', conditions: [{ field: 'v', operator, value }] },
        { v: val }
      );
    expect(make(passing).status).toBe('passed');
    expect(make(failing).status).toBe('failed');
  });

  it('flat OR: passes when any passes, fails when all fail', () => {
    const criteria = {
      operator: 'or' as const,
      conditions: [
        { field: 'accuracy', operator: '>=' as const, value: 0.7 },
        { field: 'length', operator: '>' as const, value: 5 },
      ],
    };
    expect(evaluatePassCriteria(criteria, { accuracy: 0.3, length: 10 }).status).toBe('passed');
    expect(evaluatePassCriteria(criteria, { accuracy: 0.3, length: 2 }).status).toBe('failed');
  });

  it('NaN and Infinity field values produce no_criteria config errors', () => {
    const criteria = {
      operator: 'and' as const,
      conditions: [{ field: 'score', operator: '>=' as const, value: 0.7 }],
    };
    const nan = evaluatePassCriteria(criteria, { score: Number.NaN });
    expect(nan.status).toBe('no_criteria');
    expect(nan.configurationErrors?.[0]).toContain('NaN');

    const inf = evaluatePassCriteria(criteria, { score: Number.POSITIVE_INFINITY });
    expect(inf.status).toBe('no_criteria');
    expect(inf.configurationErrors?.[0]).toContain('not a finite number');
  });

  it('config errors (missing field, non-numeric) produce no_criteria at any depth', () => {
    expect(
      evaluatePassCriteria(
        { operator: 'and', conditions: [{ field: 'missing', operator: '>=', value: 0.7 }] },
        { other: 1 }
      ).status
    ).toBe('no_criteria');

    const nested = evaluatePassCriteria(
      {
        operator: 'and',
        conditions: [
          { field: 'score', operator: '>=', value: 0.7 },
          { operator: 'or', conditions: [{ field: 'gone', operator: '>=', value: 0.5 }] },
        ],
      },
      { score: 0.9 }
    );
    expect(nested.status).toBe('no_criteria');
    expect(nested.configurationErrors?.[0]).toContain("Field 'gone'");
  });

  it('boolean conditions: = and != with true and false values', () => {
    const eqTrue = {
      operator: 'and' as const,
      conditions: [{ field: 'ok', operator: '=' as const, value: true }],
    };
    expect(evaluatePassCriteria(eqTrue, { ok: true }).status).toBe('passed');
    expect(evaluatePassCriteria(eqTrue, { ok: false }).status).toBe('failed');

    const eqFalse = {
      operator: 'and' as const,
      conditions: [{ field: 'hallucinated', operator: '=' as const, value: false }],
    };
    expect(evaluatePassCriteria(eqFalse, { hallucinated: false }).status).toBe('passed');
    expect(evaluatePassCriteria(eqFalse, { hallucinated: true }).status).toBe('failed');

    const neqTrue = {
      operator: 'and' as const,
      conditions: [{ field: 'spam', operator: '!=' as const, value: true }],
    };
    expect(evaluatePassCriteria(neqTrue, { spam: false }).status).toBe('passed');
    expect(evaluatePassCriteria(neqTrue, { spam: true }).status).toBe('failed');

    const neqFalse = {
      operator: 'and' as const,
      conditions: [{ field: 'valid', operator: '!=' as const, value: false }],
    };
    expect(evaluatePassCriteria(neqFalse, { valid: true }).status).toBe('passed');
    expect(evaluatePassCriteria(neqFalse, { valid: false }).status).toBe('failed');
  });

  it('boolean condition on non-boolean field is a config error', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '=', value: true }] },
      { score: 0.8 }
    );
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors?.[0]).toContain('not a boolean');
  });

  it('nested groups: (A AND B) OR (C AND D)', () => {
    const criteria = {
      operator: 'or' as const,
      conditions: [
        {
          operator: 'and' as const,
          conditions: [
            { field: 'a', operator: '>=' as const, value: 0.7 },
            { field: 'b', operator: '>=' as const, value: 0.5 },
          ],
        },
        {
          operator: 'and' as const,
          conditions: [
            { field: 'c', operator: '=' as const, value: true },
            { field: 'd', operator: '>' as const, value: 10 },
          ],
        },
      ],
    };
    expect(evaluatePassCriteria(criteria, { a: 0.9, b: 0.8, c: false, d: 5 }).status).toBe(
      'passed'
    );
    expect(evaluatePassCriteria(criteria, { a: 0.1, b: 0.1, c: true, d: 20 }).status).toBe(
      'passed'
    );
    const failed = evaluatePassCriteria(criteria, { a: 0.1, b: 0.1, c: false, d: 5 });
    expect(failed.status).toBe('failed');
    expect(failed.failedConditions).toHaveLength(4);
  });

  it('OR with nested subgroup passes correctly (count-shortcut regression)', () => {
    const result = evaluatePassCriteria(
      {
        operator: 'or',
        conditions: [
          { field: 'score', operator: '>=', value: 0.9 },
          {
            operator: 'and',
            conditions: [
              { field: 'accuracy', operator: '>=', value: 0.5 },
              { field: 'relevance', operator: '>=', value: 0.5 },
            ],
          },
        ],
      },
      { score: 0.3, accuracy: 0.8, relevance: 0.7 }
    );
    expect(result.status).toBe('passed');
  });

  it('depth guard: exactly at MAX_PASS_CRITERIA_DEPTH succeeds, one over fails', () => {
    const leaf = { field: 'score', operator: '>=' as const, value: 0.5 };

    let atLimit: any = { operator: 'and', conditions: [leaf] };
    for (let i = 1; i <= 5; i++) {
      atLimit = { operator: 'and', conditions: [atLimit] };
    }
    expect(evaluatePassCriteria(atLimit, { score: 0.8 }).status).toBe('passed');

    const overLimit = { operator: 'and' as const, conditions: [atLimit] };
    const result = evaluatePassCriteria(overLimit, { score: 0.8 });
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors?.[0]).toContain('maximum nesting depth');
  });
});
