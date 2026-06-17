import type {
  PassCriteria,
  PassCriteriaCondition,
  PassCriteriaNumericOperator,
} from '../types/utility';
import { MAX_PASS_CRITERIA_DEPTH } from '../types/utility';

export type { PassCriteria, PassCriteriaCondition };

export type EvaluationStatus = 'passed' | 'failed' | 'no_criteria';

export interface PassCriteriaEvaluationResult {
  status: EvaluationStatus;
  failedConditions?: PassCriteriaCondition[];
  configurationErrors?: string[];
}

interface NodeResult {
  passed: boolean;
  failedLeaves: PassCriteriaCondition[];
  errors: string[];
}

function isGroup(node: PassCriteriaCondition | PassCriteria): node is PassCriteria {
  return 'conditions' in node && Array.isArray((node as PassCriteria).conditions);
}

function evaluateLeaf(
  condition: PassCriteriaCondition,
  result: Record<string, unknown>
): NodeResult {
  const fieldValue = result[condition.field];

  if (!(condition.field in result)) {
    return {
      passed: false,
      failedLeaves: [],
      errors: [`Field '${condition.field}' does not exist in output`],
    };
  }

  if (typeof condition.value === 'boolean') {
    if (typeof fieldValue !== 'boolean') {
      return {
        passed: false,
        failedLeaves: [],
        errors: [`Field '${condition.field}' is not a boolean (got ${typeof fieldValue})`],
      };
    }

    let passed = false;
    if (condition.operator === '=') {
      passed = fieldValue === condition.value;
    } else {
      passed = fieldValue !== condition.value;
    }

    return {
      passed,
      failedLeaves: passed ? [] : [condition],
      errors: [],
    };
  }

  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
    return {
      passed: false,
      failedLeaves: [],
      errors: [
        `Field '${condition.field}' is not a finite number (got ${typeof fieldValue === 'number' ? String(fieldValue) : typeof fieldValue})`,
      ],
    };
  }

  const numericValue = condition.value as number;
  const op = condition.operator as PassCriteriaNumericOperator;
  let passed = false;
  switch (op) {
    case '>':
      passed = fieldValue > numericValue;
      break;
    case '<':
      passed = fieldValue < numericValue;
      break;
    case '>=':
      passed = fieldValue >= numericValue;
      break;
    case '<=':
      passed = fieldValue <= numericValue;
      break;
    case '=':
      passed = fieldValue === numericValue;
      break;
    case '!=':
      passed = fieldValue !== numericValue;
      break;
    default: {
      const _exhaustive: never = op;
      passed = false;
    }
  }

  return {
    passed,
    failedLeaves: passed ? [] : [condition],
    errors: [],
  };
}

function evaluateNode(
  node: PassCriteriaCondition | PassCriteria,
  result: Record<string, unknown>,
  depth: number
): NodeResult {
  if (!isGroup(node)) {
    return evaluateLeaf(node, result);
  }

  if (depth > MAX_PASS_CRITERIA_DEPTH) {
    return {
      passed: false,
      failedLeaves: [],
      errors: [`Pass criteria exceeds maximum nesting depth of ${MAX_PASS_CRITERIA_DEPTH}`],
    };
  }

  if (node.conditions.length === 0) {
    return { passed: true, failedLeaves: [], errors: [] };
  }

  const childResults = node.conditions.map((child) =>
    evaluateNode(child, result, isGroup(child) ? depth + 1 : depth)
  );

  const allErrors = childResults.flatMap((r) => r.errors);

  if (node.operator === 'and') {
    const passed = childResults.every((r) => r.passed);
    return {
      passed,
      failedLeaves: childResults.flatMap((r) => r.failedLeaves),
      errors: allErrors,
    };
  }

  const passed = childResults.some((r) => r.passed);
  return {
    passed,
    failedLeaves: passed ? [] : childResults.flatMap((r) => r.failedLeaves),
    errors: allErrors,
  };
}

export function evaluatePassCriteria(
  criteria: PassCriteria | null | undefined,
  evaluationResult: Record<string, unknown>
): PassCriteriaEvaluationResult {
  if (!criteria || !criteria.conditions || criteria.conditions.length === 0) {
    return { status: 'no_criteria' };
  }

  const nodeResult = evaluateNode(criteria, evaluationResult, 0);

  if (nodeResult.errors.length > 0) {
    return {
      status: 'no_criteria',
      configurationErrors: nodeResult.errors,
    };
  }

  return {
    status: nodeResult.passed ? 'passed' : 'failed',
    failedConditions: nodeResult.failedLeaves.length > 0 ? nodeResult.failedLeaves : undefined,
  };
}
