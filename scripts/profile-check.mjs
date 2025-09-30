#!/usr/bin/env node

/**
 * Profile the `pnpm check` command to identify bottlenecks
 * Usage: node scripts/profile-check.mjs [--verbose]
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const VERBOSE = process.argv.includes('--verbose');
const PROFILE_FILE = 'turbo-profile.json';

function log(message, forceLog = false) {
  if (VERBOSE || forceLog) {
    console.log(message);
  }
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runCommand(command, description) {
  log(`\n${description}...`, true);
  const start = Date.now();

  try {
    execSync(command, {
      stdio: VERBOSE ? 'inherit' : 'pipe',
      encoding: 'utf-8'
    });
    const duration = Date.now() - start;
    log(`✓ ${description} completed in ${formatTime(duration)}`, true);
    return { success: true, duration, description };
  } catch (error) {
    const duration = Date.now() - start;
    log(`✗ ${description} failed after ${formatTime(duration)}`, true);
    return { success: false, duration, description, error: error.message };
  }
}

function parseProfile(profilePath) {
  if (!existsSync(profilePath)) {
    return null;
  }

  try {
    const content = readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content);
    return profile;
  } catch (error) {
    log(`Error parsing profile: ${error.message}`);
    return null;
  }
}

function analyzeProfile(profile) {
  if (!profile) {
    return null;
  }

  const taskTimings = {};

  // Handle Chrome trace format (which turbo uses)
  const events = profile.traceEvents || [];

  // Group complete events (X) by name
  const completeEvents = events.filter(e => e.ph === 'X');

  for (const event of completeEvents) {
    const name = event.name;
    const durationMs = (event.dur || 0) / 1000; // Convert microseconds to milliseconds

    // Extract package name and task from the event name
    // Format is typically like "@inkeep/agents-core:build"
    const match = name.match(/^(.+?):(build|lint|typecheck|test)$/);

    if (match) {
      const [, packageName, taskType] = match;
      const key = taskType;

      if (!taskTimings[key]) {
        taskTimings[key] = {
          count: 0,
          totalDuration: 0,
          tasks: []
        };
      }

      taskTimings[key].count++;
      taskTimings[key].totalDuration += durationMs;
      taskTimings[key].tasks.push({
        package: packageName,
        duration: durationMs,
        cached: event.args?.hit === 'HIT' || name.includes('cache hit')
      });
    }
  }

  return Object.keys(taskTimings).length > 0 ? taskTimings : null;
}

function printDetailedReport(taskTimings) {
  if (!taskTimings) return;

  console.log('\n📦 Per-Package Breakdown:');
  console.log('='.repeat(80));

  // Group by task type
  const taskTypes = Object.keys(taskTimings).sort();

  for (const taskType of taskTypes) {
    const timing = taskTimings[taskType];
    console.log(`\n${taskType}:`);
    console.log(`  Total: ${formatTime(timing.totalDuration)} across ${timing.count} package(s)`);

    // Sort packages by duration
    const sortedTasks = timing.tasks.sort((a, b) => b.duration - a.duration);

    for (const task of sortedTasks) {
      const cached = task.cached ? '(cached)' : '';
      console.log(`    ${task.package.padEnd(35)} ${formatTime(task.duration).padStart(10)} ${cached}`);
    }
  }

  // Find slowest overall
  console.log('\n🐌 Slowest Tasks:');
  console.log('='.repeat(80));

  const allTasks = [];
  for (const [taskType, timing] of Object.entries(taskTimings)) {
    for (const task of timing.tasks) {
      if (!task.cached) {
        allTasks.push({
          taskType,
          package: task.package,
          duration: task.duration
        });
      }
    }
  }

  const slowest = allTasks.sort((a, b) => b.duration - a.duration).slice(0, 10);
  for (const task of slowest) {
    console.log(`  ${task.taskType}#${task.package.padEnd(30)} ${formatTime(task.duration)}`);
  }
}

async function main() {
  console.log('🔍 Profiling pnpm check command...\n');

  // Clean up old profile file
  if (existsSync(PROFILE_FILE)) {
    unlinkSync(PROFILE_FILE);
  }

  // Run full check with profiling - this will show all sub-tasks
  console.log('🔬 Running check with detailed profiling (cache disabled)...\n');
  const checkResult = runCommand(`pnpm exec turbo check --force --profile=${PROFILE_FILE}`, 'Running turbo check with profiling');

  // Analyze profile
  const profile = parseProfile(PROFILE_FILE);
  if (profile) {
    const taskTimings = analyzeProfile(profile);
    printDetailedReport(taskTimings);
  } else {
    console.log('\n⚠️  No profile data generated. The command may have failed early.');
  }

  console.log('\n' + '='.repeat(80));
  if (existsSync(PROFILE_FILE)) {
    console.log(`Profile data saved to: ${PROFILE_FILE}`);
    console.log('View visual trace at: https://ui.perfetto.dev/ (upload the JSON file)');
  }
  console.log('='.repeat(80) + '\n');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
