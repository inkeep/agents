import { runEval } from './eval-runner';
import {
  trajectoryQualityEvaluator,
  conversationHealthEvaluator,
} from './evaluators';
import type { CapturedEval } from './types';

async function main() {
  const capturedEvalFile = process.argv[2];
  
  if (!capturedEvalFile) {
    console.error('Usage: tsx example-multiturn-eval.ts <captured-multiturn-eval-file.json>');
    process.exit(1);
  }

  console.log('🔍 Loading captured multi-turn eval...\n');
  const fs = await import('fs/promises');
  const capturedEval: CapturedEval = JSON.parse(
    await fs.readFile(capturedEvalFile, 'utf-8')
  );

  console.log('📊 Multi-Turn Eval Summary:');
  console.log(`   Conversation ID: ${capturedEval.trace.metadata.conversationId}`);
  console.log(`   Initial Message: ${capturedEval.userMessage}`);
  console.log(`   Agent: ${capturedEval.trace.metadata.agentName}`);
  console.log(`   Timeline Activities: ${capturedEval.trace.timeline.length}\n`);

  console.log('🏃 Running multi-turn evaluators...\n');
  console.log('='.repeat(80));

  const result = await runEval(capturedEval, [
    trajectoryQualityEvaluator,
    conversationHealthEvaluator,
  ]);

  console.log('='.repeat(80));
  console.log('\n📋 EVALUATION RESULTS\n');
  console.log(`Overall Score: ${(result.score * 100).toFixed(1)}%`);
  console.log(`Overall Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`);

  console.log('Individual Evaluator Results:\n');
  for (const gradingResult of result.gradingResults) {
    const status = gradingResult.passed === null 
      ? '📊 INFO' 
      : gradingResult.passed 
        ? '✅ PASS' 
        : '❌ FAIL';
    
    const score = gradingResult.score === null 
      ? 'N/A' 
      : `${(gradingResult.score * 100).toFixed(1)}%`;
    
    console.log(`${status} ${gradingResult.evaluatorName} - Score: ${score}`);
    console.log(`   Reasoning: ${gradingResult.reasoning}`);
    console.log(`   Details:`);
    console.log(JSON.stringify(gradingResult.details, null, 2).split('\n').map(line => `     ${line}`).join('\n'));
    console.log('');
  }

  const outputFile = capturedEvalFile.replace('.json', '-results.json');
  await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
  console.log(`\n💾 Results saved to: ${outputFile}`);
}

main();

