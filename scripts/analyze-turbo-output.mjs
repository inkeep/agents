#!/usr/bin/env node

/**
 * Simpler approach: Run turbo check with --summarize and parse the output
 */

import { execSync } from 'node:child_process';

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runWithTiming(command, description) {
  console.log(`\n🔍 ${description}...`);
  const start = Date.now();

  try {
    const output = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    const duration = Date.now() - start;
    console.log(`✓ Completed in ${formatTime(duration)}`);
    return { success: true, duration, description, output };
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`✗ Failed after ${formatTime(duration)}`);
    return { success: false, duration, description, output: error.stdout || error.stderr || '' };
  }
}

function main() {
  console.log('='.repeat(80));
  console.log('PROFILING: pnpm check');
  console.log('='.repeat(80));

  const tasks = [
    { cmd: 'pnpm exec turbo build --force', desc: 'Build all packages' },
    { cmd: 'pnpm exec turbo lint --force', desc: 'Lint all packages' },
    { cmd: 'pnpm exec turbo typecheck --force', desc: 'Typecheck all packages' },
    { cmd: 'pnpm exec turbo test --force', desc: 'Test all packages' }
  ];

  const results = [];
  for (const { cmd, desc } of tasks) {
    results.push(runWithTiming(cmd, desc));
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  results.sort((a, b) => b.duration - a.duration);

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${result.description.padEnd(40)} ${formatTime(result.duration)}`);
  }

  const total = results.reduce((sum, r) => sum + r.duration, 0);
  console.log('-'.repeat(80));
  console.log(`Total time: ${formatTime(total)}`);
  console.log('='.repeat(80));

  // Identify slowest task
  const slowest = results[0];
  console.log(`\n🐌 Slowest task: ${slowest.description} (${formatTime(slowest.duration)})`);

  if (!slowest.success) {
    console.log('\n⚠️  Note: This task failed. Fix the failures to get accurate timing.');
  }
}

main();
