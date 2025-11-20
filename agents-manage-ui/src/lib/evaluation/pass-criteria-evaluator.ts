export interface PassCriteriaCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

export interface PassCriteria {
  operator: 'and' | 'or';
  conditions: PassCriteriaCondition[];
}

export type EvaluationStatus = 'passed' | 'failed' | 'no_criteria';

export interface PassCriteriaEvaluationResult {
  status: EvaluationStatus;
  failedConditions?: PassCriteriaCondition[];
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

  if (typeof fieldValue !== 'number') {
    return {
      condition,
      passed: false,
      error: `Field '${condition.field}' is not a number (got ${typeof fieldValue})`,
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
    default:
      passed = false;
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

  const anyConditionHasError = conditionResults.some((result) => result.error !== undefined);

  if (anyConditionHasError) {
    return {
      status: 'no_criteria',
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

export function formatPassCriteriaExpression(criteria: PassCriteria): string {
  const conditionStrings = criteria.conditions.map(
    (cond) => `${cond.field} ${cond.operator} ${cond.value}`
  );

  if (conditionStrings.length === 0) {
    return 'No criteria defined';
  }

  if (conditionStrings.length === 1) {
    return conditionStrings[0];
  }

  return conditionStrings.join(` ${criteria.operator.toUpperCase()} `);
}

