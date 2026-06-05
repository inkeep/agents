import { describe, expect, it } from 'vitest';
import { evaluatePassCriteria } from '../pass-criteria-evaluator';

describe('evaluatePassCriteria', () => {
  it('returns no_criteria when criteria is null', () => {
    const result = evaluatePassCriteria(null, { score: 0.8 });
    expect(result.status).toBe('no_criteria');
    expect(result.failedConditions).toBeUndefined();
  });

  it('returns no_criteria when criteria is undefined', () => {
    const result = evaluatePassCriteria(undefined, { score: 0.8 });
    expect(result.status).toBe('no_criteria');
  });

  it('returns no_criteria when conditions array is empty', () => {
    const result = evaluatePassCriteria({ operator: 'and', conditions: [] }, { score: 0.8 });
    expect(result.status).toBe('no_criteria');
  });

  it('returns passed when single condition passes (>=)', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: 0.8 }
    );
    expect(result.status).toBe('passed');
    expect(result.failedConditions).toBeUndefined();
  });

  it('returns failed when single condition fails (>=)', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: 0.3 }
    );
    expect(result.status).toBe('failed');
    expect(result.failedConditions).toEqual([{ field: 'score', operator: '>=', value: 0.7 }]);
  });

  it('returns failed with AND when any condition fails', () => {
    const result = evaluatePassCriteria(
      {
        operator: 'and',
        conditions: [
          { field: 'accuracy', operator: '>=', value: 0.7 },
          { field: 'length', operator: '>', value: 5 },
        ],
      },
      { accuracy: 0.3, length: 10 }
    );
    expect(result.status).toBe('failed');
    expect(result.failedConditions).toEqual([{ field: 'accuracy', operator: '>=', value: 0.7 }]);
  });

  it('returns passed with AND when all conditions pass', () => {
    const result = evaluatePassCriteria(
      {
        operator: 'and',
        conditions: [
          { field: 'accuracy', operator: '>=', value: 0.7 },
          { field: 'length', operator: '>', value: 5 },
        ],
      },
      { accuracy: 0.9, length: 10 }
    );
    expect(result.status).toBe('passed');
  });

  it('returns passed with OR when at least one condition passes', () => {
    const result = evaluatePassCriteria(
      {
        operator: 'or',
        conditions: [
          { field: 'accuracy', operator: '>=', value: 0.7 },
          { field: 'length', operator: '>', value: 5 },
        ],
      },
      { accuracy: 0.3, length: 10 }
    );
    expect(result.status).toBe('passed');
  });

  it('returns failed with OR when all conditions fail', () => {
    const result = evaluatePassCriteria(
      {
        operator: 'or',
        conditions: [
          { field: 'accuracy', operator: '>=', value: 0.7 },
          { field: 'length', operator: '>', value: 5 },
        ],
      },
      { accuracy: 0.3, length: 2 }
    );
    expect(result.status).toBe('failed');
    expect(result.failedConditions).toHaveLength(2);
  });

  it('returns no_criteria with configurationErrors when field is missing from output', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { differentField: 0.8 }
    );
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors).toEqual(["Field 'score' does not exist in output"]);
  });

  it('returns no_criteria with configurationErrors when field value is not a number', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: 'not-a-number' }
    );
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors).toHaveLength(1);
    expect(result.configurationErrors?.[0]).toContain("Field 'score'");
  });

  it('returns no_criteria with configurationErrors when field value is NaN', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: Number.NaN }
    );
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors).toHaveLength(1);
    expect(result.configurationErrors?.[0]).toContain('NaN');
  });

  it('returns no_criteria with configurationErrors when field value is Infinity', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: Number.POSITIVE_INFINITY }
    );
    expect(result.status).toBe('no_criteria');
    expect(result.configurationErrors).toHaveLength(1);
  });

  it('does not include configurationErrors when criteria evaluates cleanly', () => {
    const result = evaluatePassCriteria(
      { operator: 'and', conditions: [{ field: 'score', operator: '>=', value: 0.7 }] },
      { score: 0.8 }
    );
    expect(result.status).toBe('passed');
    expect(result.configurationErrors).toBeUndefined();
  });

  it('handles all comparison operators correctly', () => {
    const operators = [
      { operator: '>' as const, value: 5, passing: 6, failing: 5 },
      { operator: '<' as const, value: 5, passing: 4, failing: 5 },
      { operator: '>=' as const, value: 5, passing: 5, failing: 4 },
      { operator: '<=' as const, value: 5, passing: 5, failing: 6 },
      { operator: '=' as const, value: 5, passing: 5, failing: 4 },
      { operator: '!=' as const, value: 5, passing: 4, failing: 5 },
    ];

    for (const op of operators) {
      const pass = evaluatePassCriteria(
        { operator: 'and', conditions: [{ field: 'val', operator: op.operator, value: op.value }] },
        { val: op.passing }
      );
      expect(pass.status).toBe('passed');

      const fail = evaluatePassCriteria(
        { operator: 'and', conditions: [{ field: 'val', operator: op.operator, value: op.value }] },
        { val: op.failing }
      );
      expect(fail.status).toBe('failed');
    }
  });
});
