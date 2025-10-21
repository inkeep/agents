import { readFileSync } from 'node:fs';
import { runEval } from './eval-runner';
import { hallucinationDetector } from './evaluators';
import { createLangSmithIntegration } from './langsmith-integration';
import type { CapturedEval } from './types';

const capturedEvalPath = process.argv[2] || 'captured-eval-1760965675233.json';

async function main() {
  console.log('🔍 Running hallucination detection...\n');

  const capturedEval: CapturedEval = JSON.parse(
    readFileSync(capturedEvalPath, 'utf-8')
  );

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
    [hallucinationDetector],
    {
      langsmith,
      metadata: {
        evaluationType: 'hallucination-check',
        framework: 'inkeep-agents',
      },
    }
  );

  const grading = result.gradingResults[0];

  console.log('\n📊 HALLUCINATION CHECK RESULTS\n');
  console.log('=' .repeat(60));
  console.log(`Status: ${grading.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Score: ${(grading.score)}`);
  console.log(`\nReasoning:\n${grading.reasoning}`);
  console.log('\nDetails:');
  console.log(JSON.stringify(grading.details, null, 2));
  console.log('=' .repeat(60));
}

main();