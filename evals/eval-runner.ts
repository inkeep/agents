import type {
  CapturedEval,
  EvalResult,
  Evaluator,
} from './types';

export async function runEval(
  capturedEval: CapturedEval,
  evaluators: Evaluator[]
): Promise<EvalResult> {
  const gradingResults = await Promise.all(
    evaluators.map((evaluator) => evaluator.grade(capturedEval))
  );

  const totalWeight = evaluators.reduce((sum, e) => sum + (e.weight || 1), 0);
  const weightedScore =
    gradingResults.reduce((sum, result, idx) => {
      const weight = evaluators[idx].weight || 1;
      return sum + result.score * weight;
    }, 0) / totalWeight;

  const allPassed = gradingResults.every((result) => result.passed);

  return {
    passed: allPassed,
    score: weightedScore,
    actualOutput: capturedEval,
    expectedOutput: undefined,
    gradingResults,
  };
}

