import { runEval } from './eval-runner';
import { hallucinationDetector } from './evaluators';
import capturedEval from './captured-eval-1760449975469.json';

async function main() {
  console.log('🔍 Running hallucination detection...\n');
  const result = await runEval(capturedEval, [hallucinationDetector]);
  console.log(result);
  const grading = result.gradingResults[0];
  console.log('Details:');
  console.log(JSON.stringify(grading.details, null, 2));
}

main();