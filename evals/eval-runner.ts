import type {
  EvalInput,
  EvalResult,
  Evaluator,
} from './types';
import type { LangSmithIntegration } from './langsmith-integration';

export interface RunEvalOptions {
  langsmith?: LangSmithIntegration;
  metadata?: Record<string, any>;
}

export async function runEval(
  evalInput: EvalInput,
  evaluators: Evaluator[],
  options?: RunEvalOptions
): Promise<EvalResult> {
  const gradingResults = await Promise.all(
    evaluators.map((evaluator) => evaluator.grade(evalInput))
  );

  const totalWeight = evaluators.reduce((sum, e) => sum + (e.weight || 1), 0);
  const weightedScore =
    gradingResults.reduce((sum, result, idx) => {
      const weight = evaluators[idx].weight || 1;
      return sum + result.score * weight;
    }, 0) / totalWeight;

  const allPassed = gradingResults.every((result) => result.passed);

  const result: EvalResult = {
    passed: allPassed,
    score: weightedScore,
    actualOutput: evalInput,
    gradingResults,
  };

  if (options?.langsmith) {
    await options.langsmith.logEvaluation(
      evalInput,
      result,
      options.metadata
    );
  }

  return result;
}

