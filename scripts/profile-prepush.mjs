#!/usr/bin/env node

/**
 * Script to profile pre-push hook (check:husky) performance
 * Usage: node scripts/profile-prepush.mjs [--run]
 *
 * Without --run: Analyzes the most recent turbo summary
 * With --run: Runs check:husky with profiling and then analyzes
 */

import { execSync } from "child_process";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function formatDuration(seconds) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${minutes}m ${secs}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function formatBar(value, max, width = 40) {
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function findLatestSummary() {
  const turboRunsDir = join(process.cwd(), ".turbo", "runs");
  if (!existsSync(turboRunsDir)) {
    return null;
  }

  const files = readdirSync(turboRunsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: join(turboRunsDir, f),
      mtime: new Date(readFileSync(join(turboRunsDir, f), "utf8").match(/"startTime":\s*(\d+)/)?.[1] || 0),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files[0]?.path || null;
}

function analyzeSummary(summaryPath) {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

  const totalTime = (summary.execution.endTime - summary.execution.startTime) / 1000;
  const tasks = summary.tasks.map((t) => ({
    ...t,
    duration: (t.execution.endTime - t.execution.startTime) / 1000,
  }));

  // Group by task type
  const byTaskType = {};
  for (const task of tasks) {
    if (!byTaskType[task.task]) {
      byTaskType[task.task] = { tasks: [], total: 0 };
    }
    byTaskType[task.task].tasks.push(task);
    byTaskType[task.task].total += task.duration;
  }

  // Group by package
  const byPackage = {};
  for (const task of tasks) {
    if (!byPackage[task.package]) {
      byPackage[task.package] = { tasks: [], total: 0 };
    }
    byPackage[task.package].tasks.push(task);
    byPackage[task.package].total += task.duration;
  }

  // Find slowest tasks
  const sortedTasks = [...tasks].sort((a, b) => b.duration - a.duration);
  const maxDuration = sortedTasks[0]?.duration || 1;

  console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║           PRE-PUSH HOOK PERFORMANCE PROFILE                   ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.bright}Total Wall-Clock Time:${colors.reset} ${colors.yellow}${formatDuration(totalTime)}${colors.reset}`);
  console.log(`${colors.dim}Tasks Executed: ${summary.execution.attempted} | Cached: ${summary.execution.cached}${colors.reset}\n`);

  // Task type breakdown
  console.log(`${colors.bright}${colors.blue}═══ Time by Task Type (sum across packages) ═══${colors.reset}\n`);
  const sortedTypes = Object.entries(byTaskType).sort((a, b) => b[1].total - a[1].total);
  const maxTypeTotal = sortedTypes[0]?.[1].total || 1;

  for (const [taskType, data] of sortedTypes) {
    const bar = formatBar(data.total, maxTypeTotal, 30);
    console.log(`  ${colors.green}${taskType.padEnd(12)}${colors.reset} ${bar} ${formatDuration(data.total).padStart(8)} (${data.tasks.length} pkgs)`);
  }

  // Slowest individual tasks
  console.log(`\n${colors.bright}${colors.blue}═══ Slowest Individual Tasks (Top 10) ═══${colors.reset}\n`);
  for (const task of sortedTasks.slice(0, 10)) {
    const bar = formatBar(task.duration, maxDuration, 30);
    const taskName = `${task.package.replace("@inkeep/", "")}#${task.task}`;
    const cached = task.cache?.status === "HIT" ? `${colors.green}[cached]${colors.reset}` : "";
    console.log(`  ${bar} ${formatDuration(task.duration).padStart(8)}  ${taskName} ${cached}`);
  }

  // Critical path analysis
  console.log(`\n${colors.bright}${colors.blue}═══ Critical Path Analysis ═══${colors.reset}\n`);

  // Find tasks that block the most other tasks
  const buildTasks = tasks.filter((t) => t.task === "build").sort((a, b) => b.duration - a.duration);

  console.log(`  ${colors.yellow}Slowest builds (these block downstream tasks):${colors.reset}`);
  for (const task of buildTasks.slice(0, 5)) {
    const pct = ((task.duration / totalTime) * 100).toFixed(0);
    console.log(`    • ${task.package.replace("@inkeep/", "")}: ${formatDuration(task.duration)} (${pct}% of total time)`);
  }

  // Recommendations
  console.log(`\n${colors.bright}${colors.magenta}═══ Optimization Recommendations ═══${colors.reset}\n`);

  const docsBuild = tasks.find((t) => t.package === "@inkeep/agents-docs" && t.task === "build");
  const uiBuild = tasks.find((t) => t.package === "@inkeep/agents-manage-ui" && t.task === "build");

  if (docsBuild && docsBuild.duration > 30) {
    console.log(`  ${colors.yellow}1. Exclude agents-docs from pre-push hook${colors.reset}`);
    console.log(`     ${colors.dim}Impact: Save ~${formatDuration(docsBuild.duration)} (docs don't need validation on every push)${colors.reset}`);
    console.log(`     ${colors.dim}How: Add --filter='!@inkeep/agents-docs' to check:husky${colors.reset}\n`);
  }

  if (summary.execution.cached === 0) {
    console.log(`  ${colors.yellow}2. Enable Turbo Remote Caching${colors.reset}`);
    console.log(`     ${colors.dim}Impact: Subsequent runs with unchanged code will be nearly instant${colors.reset}`);
    console.log(`     ${colors.dim}How: npx turbo login && npx turbo link${colors.reset}\n`);
  }

  if (uiBuild && uiBuild.duration > 60) {
    console.log(`  ${colors.yellow}3. Consider excluding agents-manage-ui from pre-push${colors.reset}`);
    console.log(`     ${colors.dim}Impact: Save ~${formatDuration(uiBuild.duration)} if UI isn't changing${colors.reset}`);
    console.log(`     ${colors.dim}How: Add --filter='!@inkeep/agents-manage-ui' to check:husky${colors.reset}\n`);
  }

  console.log(`  ${colors.yellow}4. Use affected-only checks for faster iterations${colors.reset}`);
  console.log(`     ${colors.dim}Run: pnpm turbo check:husky --filter='...[origin/main]'${colors.reset}`);
  console.log(`     ${colors.dim}This only checks packages affected by your changes${colors.reset}\n`);

  // Proposed filter
  const excludePackages = [];
  if (docsBuild && docsBuild.duration > 30) excludePackages.push("@inkeep/agents-docs");

  if (excludePackages.length > 0) {
    const filterStr = excludePackages.map((p) => `--filter='!${p}'`).join(" ");
    console.log(`${colors.bright}${colors.green}═══ Suggested check:husky Command ═══${colors.reset}\n`);
    console.log(`  turbo check:husky --filter='!agents-cookbook-templates' ${filterStr}\n`);
  }
}

function runProfile() {
  console.log(`${colors.cyan}Running check:husky with profiling...${colors.reset}\n`);

  try {
    execSync("TURBO_UI=stream pnpm turbo check:husky --filter='!agents-cookbook-templates' --summarize", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error(`${colors.red}check:husky failed${colors.reset}`);
    process.exit(1);
  }
}

// Main
if (values.help) {
  console.log(`
Profile pre-push hook (check:husky) performance

Usage: node scripts/profile-prepush.mjs [options]

Options:
  --run     Run check:husky first, then analyze
  -h, --help  Show this help message

Without --run, analyzes the most recent turbo run summary.
`);
  process.exit(0);
}

if (values.run) {
  runProfile();
}

const summaryPath = findLatestSummary();
if (!summaryPath) {
  console.error(`${colors.red}No turbo run summary found. Run with --run flag or run check:husky first.${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.dim}Analyzing: ${summaryPath}${colors.reset}`);
analyzeSummary(summaryPath);
