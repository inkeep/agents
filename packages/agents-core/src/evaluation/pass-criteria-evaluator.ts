import type { PassCriteria, PassCriteriaCondition } from '../types/utility';

export type { PassCriteria, PassCriteriaCondition };

export type EvaluationStatus = 'passed' | 'failed' | 'no_criteria';

export interface PassCriteriaEvaluationResult {
  status: EvaluationStatus;
  failedConditions?: PassCriteriaCondition[];
  configurationErrors?: string[];
}

interface ConditionResult {
  condition: PassCriteriaCondition;
  passed: boolean;
  error?: string;
}

function evaluateCondition(
  condition: PassCriteriaCondition,
  result: Record<string, unknown>
): ConditionResult {
  const fieldValue = result[condition.field];

  if (!(condition.field in result)) {
    return {
      condition,
      passed: false,
      error: `Field '${condition.field}' does not exist in output`,
    };
  }

  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
    return {
      condition,
      passed: false,
      error: `Field '${condition.field}' is not a finite number (got ${typeof fieldValue === 'number' ? String(fieldValue) : typeof fieldValue})`,
    };
  }

  let passed = false;
  switch (condition.operator) {
    case '>':
      passed = fieldValue > condition.value;
      break;
    case '<':
      passed = fieldValue < condition.value;
      break;
    case '>=':
      passed = fieldValue >= condition.value;
      break;
    case '<=':
      passed = fieldValue <= condition.value;
      break;
    case '=':
      passed = fieldValue === condition.value;
      break;
    case '!=':
      passed = fieldValue !== condition.value;
      break;
    default: {
      const _exhaustive: never = condition.operator;
      passed = false;
    }
  }

  return { condition, passed };
}

export function evaluatePassCriteria(
  criteria: PassCriteria | null | undefined,
  evaluationResult: Record<string, unknown>
): PassCriteriaEvaluationResult {
  if (!criteria || !criteria.conditions || criteria.conditions.length === 0) {
    return { status: 'no_criteria' };
  }

  const conditionResults: ConditionResult[] = criteria.conditions.map((condition) =>
    evaluateCondition(condition, evaluationResult)
  );

  const configurationErrors = conditionResults
    .map((result) => result.error)
    .filter((error): error is string => error !== undefined);

  if (configurationErrors.length > 0) {
    return {
      status: 'no_criteria',
      configurationErrors,
    };
  }

  const failedConditions = conditionResults
    .filter((result) => !result.passed)
    .map((result) => result.condition);

  if (criteria.operator === 'and') {
    return {
      status: failedConditions.length === 0 ? 'passed' : 'failed',
      failedConditions: failedConditions.length > 0 ? failedConditions : undefined,
    };
  }

  const allFailed = failedConditions.length === criteria.conditions.length;
  return {
    status: allFailed ? 'failed' : 'passed',
    failedConditions: allFailed ? failedConditions : undefined,
  };
}
