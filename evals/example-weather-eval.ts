import { runEval } from './eval-runner';
import {
  hallucinationDetector,
  toolUsageEvaluator,
  conversationQualityEvaluator,
} from './evaluators';
import { createLangSmithIntegration } from './langsmith-integration';
import capturedEval from './captured-eval-1760449975469.json';

async function main() {
  console.log('🧪 Running evaluation on captured trace...\n');

  const useLangSmith = process.env.LANGSMITH_API_KEY !== undefined;
  const langsmith = useLangSmith
    ? createLangSmithIntegration({
        projectName: process.env.LANGSMITH_PROJECT || 'inkeep-agent-evals',
      })
    : undefined;

  if (langsmith) {
    console.log('📊 LangSmith integration enabled\n');
  }

  const result = await runEval(
    capturedEval,
    [
      hallucinationDetector,
      toolUsageEvaluator,
      conversationQualityEvaluator,
    ],
    {
      langsmith,
      metadata: {
        evaluationType: 'automated',
        framework: 'inkeep-agents',
      },
    }
  );

  console.log('📊 EVALUATION RESULTS\n');
  console.log('=' .repeat(60));
  console.log(`Overall Passed: ${result.passed ? '✅' : '❌'}`);
  console.log(`Overall Score: ${(result.score * 100).toFixed(1)}%`);

  console.log('\n📋 EVALUATOR RESULTS\n');
  for (const grading of result.gradingResults) {
    console.log(`\n${grading.evaluatorName}: ${grading.passed ? '✅' : '❌'} (${(grading.score * 100).toFixed(1)}%)`);
    console.log(`Reasoning: ${grading.reasoning}`);
    console.log('Details:', JSON.stringify(grading.details, null, 2));
  }

  console.log('\n' + '=' .repeat(60));
}

main();

