import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { Evaluator } from '@/lib/api/evaluators';
import {
  type EvaluationStatus,
  evaluatePassCriteria,
} from '@/lib/evaluation/pass-criteria-evaluator';

export type OutputFilterOperator =
  | '='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'contains'
  | 'ncontains'
  | 'exists'
  | 'nexists';

export interface OutputFilter {
  key: string;
  operator: OutputFilterOperator;
  value: string;
}

export interface EvaluationResultFilters {
  status?: EvaluationStatus | 'all';
  evaluatorId?: string;
  agentId?: string;
  searchInput?: string;
  outputFilters?: OutputFilter[];
}

/**
 * Get a nested value from an object using a dot-notation path.
 * Supports arrays by collecting values from all items.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== 'object') return undefined;

  const [head, ...rest] = path.split('.');
  if (!head) return obj;

  // Handle arrays by mapping over elements
  if (Array.isArray(obj)) {
    const values = obj.map((item) => getNestedValue(item, path)).filter((v) => v !== undefined);
    return values.length ? values : undefined;
  }

  const value = (obj as Record<string, unknown>)[head];
  return rest.length ? getNestedValue(value, rest.join('.')) : value;
}

/**
 * Check if a single value matches a filter condition
 */
function matchesSingleValue(value: unknown, filter: OutputFilter): boolean {
  const { operator, value: filterValue } = filter;

  // For other operators, undefined/null values don't match
  if (value === undefined || value === null) {
    return false;
  }

  const stringValue = String(value).toLowerCase();
  const filterStringValue = filterValue.toLowerCase();

  switch (operator) {
    case '=':
      if (!Number.isNaN(Number(value)) && !Number.isNaN(Number(filterValue))) {
        return Number(value) === Number(filterValue);
      }
      if (typeof value === 'boolean') {
        return value === (filterValue === 'true');
      }
      return stringValue === filterStringValue;

    case '!=':
      if (!Number.isNaN(Number(value)) && !Number.isNaN(Number(filterValue))) {
        return Number(value) !== Number(filterValue);
      }
      if (typeof value === 'boolean') {
        return value !== (filterValue === 'true');
      }
      return stringValue !== filterStringValue;

    case '<':
      return Number(value) < Number(filterValue);

    case '>':
      return Number(value) > Number(filterValue);

    case '<=':
      return Number(value) <= Number(filterValue);

    case '>=':
      return Number(value) >= Number(filterValue);

    case 'contains':
      return stringValue.includes(filterStringValue);

    case 'ncontains':
      return !stringValue.includes(filterStringValue);

    default:
      return true;
  }
}

/**
 * Check if a value matches a filter condition
 * Supports array values: returns true if ANY item in the array matches
 */
function matchesOutputFilter(value: unknown, filter: OutputFilter): boolean {
  const { operator } = filter;

  // Handle exists/nexists operators
  if (operator === 'exists') {
    if (Array.isArray(value)) {
      return value.length > 0 && value.some((v) => v !== undefined && v !== null);
    }
    return value !== undefined && value !== null;
  }
  if (operator === 'nexists') {
    if (Array.isArray(value)) {
      return value.length === 0 || value.every((v) => v === undefined || v === null);
    }
    return value === undefined || value === null;
  }

  // For array values (from array traversal), check if ANY item matches
  if (Array.isArray(value)) {
    return value.some((item) => matchesSingleValue(item, filter));
  }

  return matchesSingleValue(value, filter);
}

export function filterEvaluationResults(
  results: EvaluationResult[],
  filters: EvaluationResultFilters,
  evaluators: Evaluator[]
): EvaluationResult[] {
  return results.filter((result) => {
    if (filters.evaluatorId && filters.evaluatorId !== result.evaluatorId) {
      return false;
    }

    if (filters.agentId && filters.agentId !== result.agentId) {
      return false;
    }

    if (filters.status && filters.status !== 'all') {
      const evaluator = evaluators.find((e) => e.id === result.evaluatorId);
      const resultData =
        result.output && typeof result.output === 'object'
          ? (result.output as Record<string, unknown>)
          : {};
      const outputData =
        resultData.output && typeof resultData.output === 'object'
          ? (resultData.output as Record<string, unknown>)
          : resultData;
      const evaluation = evaluatePassCriteria(evaluator?.passCriteria, outputData);

      if (evaluation.status !== filters.status) {
        return false;
      }
    }

    if (filters.searchInput && filters.searchInput.trim() !== '') {
      const searchTerm = filters.searchInput.toLowerCase();
      const input = (result.input || result.conversationId || '').toLowerCase();
      if (!input.includes(searchTerm)) {
        return false;
      }
    }

    // Apply output schema filters
    if (filters.outputFilters && filters.outputFilters.length > 0) {
      for (const filter of filters.outputFilters) {
        if (!filter.key.trim()) continue; // Skip empty keys

        const value = getNestedValue(result.output, filter.key);
        if (!matchesOutputFilter(value, filter)) {
          return false;
        }
      }
    }

    return true;
  });
}
