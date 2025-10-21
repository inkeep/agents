import { readFileSync } from 'node:fs';
import { runEval } from './eval-runner';
import { hallucinationDetector, modelComparisonEvaluator } from './evaluators';
import { createLangSmithIntegration } from './langsmith-integration';
import type { CapturedEval } from './types';

const baselinePath = process.argv[2] || 'captured-eval-claude-3-5-haiku-20241022-1760986296450.json';
const candidatePath = process.argv[3] || 'captured-eval-claude-sonnet-4-20250514-1760985271409.json';

if (!baselinePath || !candidatePath) {
  console.error('Usage: tsx run-model-comparison.ts <baseline-eval.json> <candidate-eval.json>');
  process.exit(1);
}

async function main() {
  console.log('🔍 Running model comparison...\n');

  const baseline: CapturedEval = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  const candidate: CapturedEval = JSON.parse(readFileSync(candidatePath, 'utf-8'));

  console.log(`📊 Baseline: ${baselinePath}`);
  console.log(`📊 Candidate: ${candidatePath}\n`);

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
    { baseline, candidate },
    [modelComparisonEvaluator, hallucinationDetector],
    {
      langsmith,
      metadata: {
        evaluationType: 'model-comparison',
        framework: 'inkeep-agents',
        baselinePath,
        candidatePath,
      },
    }
  );

  const grading = result.gradingResults[0];

  console.log('\n📊 MODEL COMPARISON RESULTS\n');
  console.log('='.repeat(60));
  console.log(`Status: ${grading.passed === null ? 'N/A' : grading.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Score: ${grading.score === null ? 'N/A' : grading.score}`);
  console.log(`\nReasoning:\n${grading.reasoning}`);
  console.log('\nDetails:');
  console.log(JSON.stringify(grading.details, null, 2));
  console.log('='.repeat(60));

  const details = grading.details;
  if (details.recommendation) {
    console.log('\n🎯 RECOMMENDATION');
    console.log('='.repeat(60));
    const recMap = {
      use_baseline: '📉 Use BASELINE model',
      use_candidate: '📈 Use CANDIDATE model',
      equivalent: '⚖️  Models are EQUIVALENT',
    };
    console.log(recMap[details.recommendation as keyof typeof recMap] || details.recommendation);
    console.log('='.repeat(60));
  }
}

main();

