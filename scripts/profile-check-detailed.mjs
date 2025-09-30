#!/usr/bin/env node

/**
 * Detailed profiling of pnpm check command
 * Uses turbo's --dry=json to understand the task graph and timing
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runCommand(command, description) {
  console.log(`\n${description}...`);
  const start = Date.now();

  try {
    const output = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    const duration = Date.now() - start;
    return { success: true, duration, description, output };
  } catch (error) {
    const duration = Date.now() - start;
    return { success: false, duration, description, output: error.stdout || error.stderr || '' };
  }
}

function parsePackages() {
  try {
    const result = runCommand('pnpm exec turbo check --dry=json', 'Analyzing task graph');
    if (result.success) {
      const data = JSON.parse(result.output);
      return data;
    }
  } catch (error) {
    console.error('Error parsing task graph:', error.message);
  }
  return null;
}

function extractTaskTimings(output) {
  const timings = [];
  const cacheHits = [];
  const cacheMisses = [];

  // Parse cache hit/miss lines
  const cacheHitRegex = /^(.+?):(build|lint|typecheck|test): cache hit/gm;
  const cacheMissRegex = /^(.+?):(build|lint|typecheck|test): cache miss/gm;

  let match;
  while ((match = cacheHitRegex.exec(output)) !== null) {
    cacheHits.push({ package: match[1], task: match[2] });
  }

  while ((match = cacheMissRegex.exec(output)) !== null) {
    cacheMisses.push({ package: match[1], task: match[2] });
  }

  return { cacheHits, cacheMisses };
}

function main() {
  console.log('='.repeat(80));
  console.log('DETAILED PROFILING: pnpm check');
  console.log('='.repeat(80));

  // Step 1: Run each task and time it
  const tasks = [
    { cmd: 'pnpm exec turbo build --continue --force', task: 'build' },
    { cmd: 'pnpm exec turbo lint --continue --force', task: 'lint' },
    { cmd: 'pnpm exec turbo typecheck --continue --force', task: 'typecheck' },
    { cmd: 'pnpm exec turbo test --continue --force', task: 'test' }
  ];

  const taskResults = {};

  for (const { cmd, task } of tasks) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running: ${task.toUpperCase()}`);
    console.log('='.repeat(80));

    const result = runCommand(cmd, `Executing ${task}`);
    taskResults[task] = result;

    // Extract cache hit/miss info
    const { cacheHits, cacheMisses } = extractTaskTimings(result.output);

    console.log(`\n📊 ${task} results:`);
    console.log(`  Duration: ${formatTime(result.duration)}`);
    console.log(`  Cache hits: ${cacheHits.length}`);
    console.log(`  Cache misses: ${cacheMisses.length}`);
    console.log(`  Status: ${result.success ? '✓ Success' : '✗ Failed'}`);

    if (cacheMisses.length > 0) {
      console.log(`\n  Cache misses (slowest):`);
      for (const { package: pkg } of cacheMisses.slice(0, 5)) {
        console.log(`    - ${pkg}`);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const sortedTasks = Object.entries(taskResults).sort((a, b) => b[1].duration - a[1].duration);

  for (const [task, result] of sortedTasks) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${task.padEnd(15)} ${formatTime(result.duration)}`);
  }

  const total = Object.values(taskResults).reduce((sum, r) => sum + r.duration, 0);
  console.log('-'.repeat(80));
  console.log(`Total: ${formatTime(total)}`);

  // Recommendations
  console.log(`\n${'='.repeat(80)}`);
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));

  const [slowestTask, slowestResult] = sortedTasks[0];
  console.log(`\n1. Slowest task: ${slowestTask} (${formatTime(slowestResult.duration)})`);

  const { cacheMisses } = extractTaskTimings(slowestResult.output);
  if (cacheMisses.length > 0) {
    console.log(`\n2. Cache misses in ${slowestTask}:`);
    for (const { package: pkg, task } of cacheMisses.slice(0, 10)) {
      console.log(`   - ${pkg}:${task}`);
    }
    console.log('\n   → These packages take the longest because they need to rebuild.');
    console.log('   → Fix any build errors to enable caching.');
  }

  // Check for failures
  const failures = sortedTasks.filter(([, r]) => !r.success);
  if (failures.length > 0) {
    console.log(`\n3. Failed tasks:`);
    for (const [task] of failures) {
      console.log(`   - ${task}`);
    }
    console.log('\n   → Fix these failures to improve cache hit rates and speed.');
  }

  console.log('\n' + '='.repeat(80));
}

main();
