#!/usr/bin/env node

/**
 * Enforce Coverage Change Script
 *
 * This script ensures that new code changes maintain or improve coverage.
 * It compares coverage between the current branch and the base branch (main).
 * Used in CI/CD and as a pre-commit hook.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

/**
 * Execute command and return output
 */
function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    if (!options.ignoreError) {
      console.error(`❌ Command failed: ${command}`);
      console.error(error.message);
    }
    return null;
  }
}

/**
 * Get current git branch
 */
function getCurrentBranch() {
  return exec('git rev-parse --abbrev-ref HEAD');
}

/**
 * Get list of changed files
 */
function getChangedFiles(baseBranch = 'main') {
  const files = exec(`git diff --name-only ${baseBranch}...HEAD`);
  return files ? files.split('\n').filter(Boolean) : [];
}

/**
 * Get changed packages based on changed files
 */
function getChangedPackages(changedFiles) {
  const packages = new Set();

  changedFiles.forEach((file) => {
    // Determine which package the file belongs to
    if (file.startsWith('inkeep-management-api/')) {
      packages.add('inkeep-management-api');
    } else if (file.startsWith('inkeep-execution-api/')) {
      packages.add('inkeep-execution-api');
    } else if (file.startsWith('agent-builder/')) {
      packages.add('agent-builder');
    } else if (file.startsWith('cli/')) {
      packages.add('cli');
    } else if (file.startsWith('packages/')) {
      const match = file.match(/^packages\/([^/]+)\//);
      if (match) {
        packages.add(`packages/${match[1]}`);
      }
    }
  });

  return Array.from(packages);
}

/**
 * Run coverage for specific packages
 */
function runCoverageForPackages(packages) {
  console.log(`\n📊 Running coverage for changed packages: ${packages.join(', ')}\n`);

  const results = {};

  packages.forEach((pkg) => {
    console.log(`Testing ${pkg}...`);
    const pkgPath = join(rootDir, pkg);

    if (!existsSync(join(pkgPath, 'package.json'))) {
      console.warn(`⚠️  Package ${pkg} not found, skipping`);
      return;
    }

    // Run tests with coverage for this package
    const success = exec('pnpm test:coverage', {
      cwd: pkgPath,
      ignoreError: true,
      stdio: 'inherit',
    });

    if (success === null) {
      console.error(`❌ Tests failed for ${pkg}`);
      results[pkg] = { error: true };
      return;
    }

    // Read coverage summary
    const summaryPath = join(pkgPath, 'coverage', 'coverage-summary.json');
    if (existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
        results[pkg] = summary.total;
      } catch (_error) {
        console.error(`❌ Could not read coverage for ${pkg}`);
        results[pkg] = { error: true };
      }
    }
  });

  return results;
}

/**
 * Compare coverage between base and current
 */
function compareCoverage(baseCoverage, currentCoverage) {
  const comparison = {
    improved: [],
    degraded: [],
    maintained: [],
    new: [],
  };

  const metrics = ['lines', 'statements', 'functions', 'branches'];

  Object.keys(currentCoverage).forEach((pkg) => {
    if (currentCoverage[pkg].error) {
      comparison.degraded.push({
        package: pkg,
        reason: 'Tests failed',
      });
      return;
    }

    if (!baseCoverage[pkg]) {
      comparison.new.push({
        package: pkg,
        coverage: currentCoverage[pkg],
      });
      return;
    }

    let improved = false;
    let degraded = false;
    const details = {};

    metrics.forEach((metric) => {
      const base = baseCoverage[pkg][metric]?.pct || 0;
      const current = currentCoverage[pkg][metric]?.pct || 0;
      const diff = current - base;

      details[metric] = {
        base: base.toFixed(2),
        current: current.toFixed(2),
        diff: diff.toFixed(2),
      };

      if (diff > 0.1) improved = true;
      if (diff < -0.1) degraded = true;
    });

    if (degraded) {
      comparison.degraded.push({
        package: pkg,
        details,
      });
    } else if (improved) {
      comparison.improved.push({
        package: pkg,
        details,
      });
    } else {
      comparison.maintained.push({
        package: pkg,
        details,
      });
    }
  });

  return comparison;
}

/**
 * Generate coverage report
 */
function generateReport(comparison, changedFiles) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📈 COVERAGE ENFORCEMENT REPORT');
  console.log(`${'='.repeat(60)}\n`);

  console.log(`Changed files: ${changedFiles.length}`);
  console.log(
    `Affected packages: ${Object.keys(comparison.improved.length + comparison.degraded.length + comparison.maintained.length + comparison.new.length)}\n`
  );

  if (comparison.improved.length > 0) {
    console.log('✅ Improved Coverage:');
    comparison.improved.forEach((item) => {
      console.log(`  ${item.package}:`);
      Object.entries(item.details).forEach(([metric, data]) => {
        if (parseFloat(data.diff) > 0) {
          console.log(`    ${metric}: ${data.base}% → ${data.current}% (+${data.diff}%)`);
        }
      });
    });
    console.log();
  }

  if (comparison.maintained.length > 0) {
    console.log('🔄 Maintained Coverage:');
    comparison.maintained.forEach((item) => {
      console.log(`  ${item.package}`);
    });
    console.log();
  }

  if (comparison.new.length > 0) {
    console.log('🆕 New Package Coverage:');
    comparison.new.forEach((item) => {
      console.log(`  ${item.package}:`);
      const cov = item.coverage;
      console.log(`    Lines: ${cov.lines?.pct?.toFixed(2)}%`);
      console.log(`    Functions: ${cov.functions?.pct?.toFixed(2)}%`);
    });
    console.log();
  }

  if (comparison.degraded.length > 0) {
    console.log('❌ Degraded Coverage:');
    comparison.degraded.forEach((item) => {
      console.log(`  ${item.package}:`);
      if (item.reason) {
        console.log(`    ${item.reason}`);
      } else {
        Object.entries(item.details).forEach(([metric, data]) => {
          if (parseFloat(data.diff) < 0) {
            console.log(`    ${metric}: ${data.base}% → ${data.current}% (${data.diff}%)`);
          }
        });
      }
    });
    console.log();
  }

  const success = comparison.degraded.length === 0;

  console.log('='.repeat(60));
  if (success) {
    console.log('✅ Coverage requirements met!');
  } else {
    console.log('❌ Coverage has degraded. Please add tests for your changes.');
  }
  console.log(`${'='.repeat(60)}\n`);

  return success;
}

/**
 * Main enforcement logic
 */
async function main() {
  const args = process.argv.slice(2);
  const baseBranch = args[0] || 'main';
  const currentBranch = getCurrentBranch();

  console.log(`\n🔍 Enforcing coverage standards...`);
  console.log(`   Base branch: ${baseBranch}`);
  console.log(`   Current branch: ${currentBranch}\n`);

  // Get changed files
  const changedFiles = getChangedFiles(baseBranch);

  if (changedFiles.length === 0) {
    console.log('✅ No changes detected');
    process.exit(0);
  }

  // Determine affected packages
  const changedPackages = getChangedPackages(changedFiles);

  if (changedPackages.length === 0) {
    console.log('✅ No package changes detected');
    process.exit(0);
  }

  // Get base coverage (if available from CI artifacts or cache)
  let baseCoverage = {};
  const baseCoveragePath = join(rootDir, '.coverage-base.json');

  if (existsSync(baseCoveragePath)) {
    try {
      baseCoverage = JSON.parse(readFileSync(baseCoveragePath, 'utf8'));
    } catch (_error) {
      console.warn('⚠️  Could not read base coverage, will treat as new coverage');
    }
  } else {
    // Try to get base coverage by checking out base branch temporarily
    console.log('📊 Calculating base coverage...');

    // Stash current changes
    exec('git stash push -m "coverage-enforcement-temp"', { ignoreError: true });

    // Checkout base branch
    exec(`git checkout ${baseBranch}`, { ignoreError: true });

    // Run coverage for changed packages on base branch
    baseCoverage = runCoverageForPackages(changedPackages);

    // Return to original branch
    exec(`git checkout ${currentBranch}`, { ignoreError: true });

    // Pop stash
    exec('git stash pop', { ignoreError: true });
  }

  // Run coverage for current changes
  console.log('\n📊 Calculating current coverage...');
  const currentCoverage = runCoverageForPackages(changedPackages);

  // Compare coverage
  const comparison = compareCoverage(baseCoverage, currentCoverage);

  // Generate report
  const success = generateReport(comparison, changedFiles);

  // Save current coverage as potential base for next comparison
  writeFileSync(join(rootDir, '.coverage-current.json'), JSON.stringify(currentCoverage, null, 2));

  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { getChangedPackages, compareCoverage };
