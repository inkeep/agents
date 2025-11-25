import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { Evaluator } from '@/lib/api/evaluators';
import {
  type EvaluationStatus,
  evaluatePassCriteria,
} from '@/lib/evaluation/pass-criteria-evaluator';

export interface EvaluationResultFilters {
  status?: EvaluationStatus | 'all';
  evaluatorId?: string;
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

    return true;
  });
}

