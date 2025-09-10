#!/usr/bin/env node

/**
 * Script to profile GitHub Actions workflow performance
 * Usage: node scripts/profile-workflows.mjs [--limit 10] [--workflow "Test"]
 */

import { execSync } from 'child_process';
import { parseArgs } from 'util';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    limit: {
      type: 'string',
      default: '10',
    },
    workflow: {
      type: 'string',
      default: '',
    },
    verbose: {
      type: 'boolean',
      default: false,
    },
  },
});

const limit = parseInt(values.limit, 10);
const workflowFilter = values.workflow;
const verbose = values.verbose;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function getWorkflowRuns() {
  try {
    const cmd = `gh run list --limit ${limit} --json workflowName,status,conclusion,createdAt,updatedAt,databaseId,event,headBranch`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (error) {
    console.error(`${colors.red}Error fetching workflow runs:${colors.reset}`, error.message);
    process.exit(1);
  }
}

function getRunDetails(runId) {
  try {
    const cmd = `gh run view ${runId} --json jobs`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (error) {
    console.error(
      `${colors.red}Error fetching run details for ${runId}:${colors.reset}`,
      error.message
    );
    return null;
  }
}

function analyzeWorkflowPerformance() {
  console.log(
    `${colors.bright}${colors.blue}GitHub Actions Workflow Performance Analysis${colors.reset}\n`
  );

  const runs = getWorkflowRuns();
  const filteredRuns = workflowFilter
    ? runs.filter((r) => r.workflowName.toLowerCase().includes(workflowFilter.toLowerCase()))
    : runs;

  if (filteredRuns.length === 0) {
    console.log(
      `${colors.yellow}No runs found${workflowFilter ? ` for workflow "${workflowFilter}"` : ''}.${colors.reset}`
    );
    return;
  }

  const workflowStats = {};
  const slowestSteps = [];

  for (const run of filteredRuns) {
    if (run.status !== 'completed') continue;

    const details = getRunDetails(run.databaseId);
    if (!details || !details.jobs) continue;

    const workflowName = run.workflowName;
    if (!workflowStats[workflowName]) {
      workflowStats[workflowName] = {
        runs: [],
        totalDuration: 0,
        jobStats: {},
      };
    }

    let workflowDuration = 0;
    const jobDurations = {};

    for (const job of details.jobs) {
      const jobDuration =
        job.completedAt && job.startedAt
          ? Math.floor((new Date(job.completedAt) - new Date(job.startedAt)) / 1000)
          : 0;

      workflowDuration = Math.max(workflowDuration, jobDuration);
      jobDurations[job.name] = jobDuration;

      if (!workflowStats[workflowName].jobStats[job.name]) {
        workflowStats[workflowName].jobStats[job.name] = {
          durations: [],
          stepStats: {},
        };
      }
      workflowStats[workflowName].jobStats[job.name].durations.push(jobDuration);

      // Analyze steps
      if (job.steps && verbose) {
        for (const step of job.steps) {
          if (step.conclusion !== 'success' && step.conclusion !== 'failure') continue;

          const stepDuration =
            step.completedAt && step.startedAt
              ? Math.floor((new Date(step.completedAt) - new Date(step.startedAt)) / 1000)
              : 0;

          if (stepDuration > 10) {
            // Only track steps longer than 10 seconds
            slowestSteps.push({
              workflow: workflowName,
              job: job.name,
              step: step.name,
              duration: stepDuration,
              runId: run.databaseId,
            });
          }

          if (!workflowStats[workflowName].jobStats[job.name].stepStats[step.name]) {
            workflowStats[workflowName].jobStats[job.name].stepStats[step.name] = [];
          }
          workflowStats[workflowName].jobStats[job.name].stepStats[step.name].push(stepDuration);
        }
      }
    }

    workflowStats[workflowName].runs.push({
      id: run.databaseId,
      duration: workflowDuration,
      conclusion: run.conclusion,
      jobDurations,
      date: run.createdAt,
    });
    workflowStats[workflowName].totalDuration += workflowDuration;
  }

  // Display results
  for (const [workflowName, stats] of Object.entries(workflowStats)) {
    const avgDuration = Math.floor(stats.totalDuration / stats.runs.length);
    const successRuns = stats.runs.filter((r) => r.conclusion === 'success');
    const successRate = ((successRuns.length / stats.runs.length) * 100).toFixed(1);

    console.log(`${colors.bright}${colors.cyan}📊 ${workflowName}${colors.reset}`);
    console.log(`   Runs analyzed: ${stats.runs.length}`);
    console.log(`   Success rate: ${successRate}%`);
    console.log(
      `   Average duration: ${colors.yellow}${formatDuration(avgDuration)}${colors.reset}`
    );

    // Show job statistics
    console.log(`\n   ${colors.bright}Job Performance:${colors.reset}`);
    for (const [jobName, jobStats] of Object.entries(stats.jobStats)) {
      const avgJobDuration = Math.floor(
        jobStats.durations.reduce((a, b) => a + b, 0) / jobStats.durations.length
      );
      const maxJobDuration = Math.max(...jobStats.durations);
      const minJobDuration = Math.min(...jobStats.durations);

      console.log(`     ${colors.green}${jobName}:${colors.reset}`);
      console.log(`       Average: ${formatDuration(avgJobDuration)}`);
      console.log(
        `       Range: ${formatDuration(minJobDuration)} - ${formatDuration(maxJobDuration)}`
      );

      if (verbose && Object.keys(jobStats.stepStats).length > 0) {
        // Show slowest steps
        const slowSteps = Object.entries(jobStats.stepStats)
          .map(([stepName, durations]) => ({
            name: stepName,
            avg: Math.floor(durations.reduce((a, b) => a + b, 0) / durations.length),
          }))
          .filter((s) => s.avg > 5) // Only show steps taking more than 5 seconds
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 3);

        if (slowSteps.length > 0) {
          console.log(`       ${colors.magenta}Slowest steps:${colors.reset}`);
          for (const step of slowSteps) {
            console.log(`         • ${step.name}: ${formatDuration(step.avg)}`);
          }
        }
      }
    }

    // Show recent run trend
    console.log(`\n   ${colors.bright}Recent Runs:${colors.reset}`);
    const recentRuns = stats.runs.slice(0, 5);
    for (const run of recentRuns) {
      const icon = run.conclusion === 'success' ? '✅' : '❌';
      const date = new Date(run.date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      console.log(`     ${icon} ${formatDuration(run.duration)} - ${date} (ID: ${run.id})`);
    }
    console.log('');
  }

  // Show overall slowest steps across all workflows
  if (verbose && slowestSteps.length > 0) {
    console.log(
      `${colors.bright}${colors.red}⚠️  Slowest Steps Across All Workflows:${colors.reset}`
    );
    const topSlowSteps = slowestSteps.sort((a, b) => b.duration - a.duration).slice(0, 10);

    for (const step of topSlowSteps) {
      console.log(
        `   ${colors.yellow}${formatDuration(step.duration)}${colors.reset} - ${step.step}`
      );
      console.log(`     (${step.workflow} → ${step.job})`);
    }
    console.log('');
  }

  // Optimization recommendations
  console.log(`${colors.bright}${colors.green}💡 Optimization Recommendations:${colors.reset}`);

  // Check for slow artifact operations
  const artifactSteps = slowestSteps.filter(
    (s) =>
      s.step.toLowerCase().includes('artifact') ||
      s.step.toLowerCase().includes('upload') ||
      s.step.toLowerCase().includes('download')
  );

  if (artifactSteps.length > 0) {
    const avgArtifactTime = Math.floor(
      artifactSteps.reduce((a, b) => a + b.duration, 0) / artifactSteps.length
    );
    console.log(`   ⚠️  Artifact operations averaging ${formatDuration(avgArtifactTime)}`);
    console.log(`      Consider using caching instead of artifacts for build outputs`);
  }

  // Check for sequential jobs that could be parallel
  for (const [workflowName, stats] of Object.entries(workflowStats)) {
    const jobNames = Object.keys(stats.jobStats);
    if (jobNames.includes('test') && jobNames.includes('typecheck')) {
      console.log(`   ⚠️  "${workflowName}" runs test and typecheck sequentially`);
      console.log(`      Consider running them in parallel using matrix strategy`);
    }
  }

  // Check for long-running tests
  const testJobs = slowestSteps.filter(
    (s) => s.step.toLowerCase().includes('test') || s.step.toLowerCase().includes('spec')
  );

  if (testJobs.length > 0) {
    const avgTestTime = Math.floor(testJobs.reduce((a, b) => a + b.duration, 0) / testJobs.length);
    if (avgTestTime > 120) {
      console.log(`   ⚠️  Test execution averaging ${formatDuration(avgTestTime)}`);
      console.log(`      Consider splitting tests across multiple parallel jobs`);
    }
  }

  // Check for slow build operations
  const buildSteps = slowestSteps.filter(
    (s) => s.step.toLowerCase().includes('build') || s.step.toLowerCase().includes('compile')
  );

  if (buildSteps.length > 0) {
    const avgBuildTime = Math.floor(
      buildSteps.reduce((a, b) => a + b.duration, 0) / buildSteps.length
    );
    if (avgBuildTime > 60) {
      console.log(`   ⚠️  Build operations averaging ${formatDuration(avgBuildTime)}`);
      console.log(`      Consider enabling Turborepo remote caching or using faster build tools`);
    }
  }

  console.log(
    `\n${colors.bright}Run with --verbose flag for detailed step analysis${colors.reset}`
  );
}

// Run the analysis
analyzeWorkflowPerformance();
