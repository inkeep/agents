#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Dynamically discover packages with test coverage
function discoverPackages() {
  const packages = [];

  // Check root-level directories
  const rootDirs = readdirSync(rootDir).filter((dir) => {
    const fullPath = join(rootDir, dir);
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'package.json')) &&
      existsSync(join(fullPath, 'vitest.config.ts'))
    );
  });

  packages.push(...rootDirs);

  // Check packages directory
  const packagesDir = join(rootDir, 'packages');
  if (existsSync(packagesDir)) {
    const subPackages = readdirSync(packagesDir).filter((dir) => {
      const fullPath = join(packagesDir, dir);
      return (
        statSync(fullPath).isDirectory() &&
        existsSync(join(fullPath, 'package.json')) &&
        existsSync(join(fullPath, 'vitest.config.ts'))
      );
    });
    packages.push(...subPackages.map((pkg) => `packages/${pkg}`));
  }

  console.log('Discovered packages with test coverage:', packages);
  return packages;
}

const packages = discoverPackages();

function mergeCoverageSummaries() {
  const merged = {
    total: {
      lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
      statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
      functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 0 },
    },
  };

  const packageReports = [];

  for (const pkg of packages) {
    const summaryPath = join(rootDir, pkg, 'coverage', 'coverage-summary.json');

    if (existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

        // Add package-specific data
        packageReports.push({
          package: pkg,
          summary: summary.total,
        });

        // Merge totals with validation
        for (const metric of ['lines', 'statements', 'functions', 'branches']) {
          if (!summary.total[metric]) {
            console.warn(`⚠️  Missing ${metric} data for ${pkg}, using default values`);
            summary.total[metric] = { total: 0, covered: 0, skipped: 0, pct: 0 };
          }

          // Validate metric data structure
          const metricData = summary.total[metric];
          if (typeof metricData !== 'object' || metricData === null) {
            console.error(`❌ Invalid ${metric} data structure for ${pkg}`);
            continue;
          }

          merged.total[metric].total += metricData.total || 0;
          merged.total[metric].covered += metricData.covered || 0;
          merged.total[metric].skipped += metricData.skipped || 0;
        }
      } catch (error) {
        console.error(`❌ Error reading coverage for ${pkg}:`, error.message);
        // Track packages with errors
        packageReports.push({
          package: pkg,
          error: true,
          summary: {
            lines: { total: 0, covered: 0, pct: 0 },
            statements: { total: 0, covered: 0, pct: 0 },
            functions: { total: 0, covered: 0, pct: 0 },
            branches: { total: 0, covered: 0, pct: 0 },
          },
        });
      }
    } else {
      console.warn(`⚠️  No coverage found for ${pkg} - this may indicate test failures`);
      // Add placeholder for missing coverage
      packageReports.push({
        package: pkg,
        missing: true,
        summary: {
          lines: { total: 0, covered: 0, pct: 0 },
          statements: { total: 0, covered: 0, pct: 0 },
          functions: { total: 0, covered: 0, pct: 0 },
          branches: { total: 0, covered: 0, pct: 0 },
        },
      });
    }
  }

  // Calculate percentages
  for (const metric of ['lines', 'statements', 'functions', 'branches']) {
    const total = merged.total[metric].total;
    const covered = merged.total[metric].covered;
    merged.total[metric].pct = total > 0 ? (covered / total) * 100 : 0;
  }

  return { merged, packageReports };
}

function generateMarkdownReport(merged, packageReports) {
  let markdown = '# Test Coverage Report\n\n';

  // Overall coverage
  markdown += '## Overall Coverage\n\n';
  markdown += '| Metric | Coverage | Total | Covered |\n';
  markdown += '|--------|----------|-------|--------|\n';

  for (const [metric, data] of Object.entries(merged.total)) {
    if (metric !== 'branchesTrue') {
      const metricName = metric.charAt(0).toUpperCase() + metric.slice(1);
      markdown += `| ${metricName} | ${data.pct.toFixed(2)}% | ${data.total} | ${data.covered} |\n`;
    }
  }

  // Per-package coverage
  markdown += '\n## Coverage by Package\n\n';

  for (const report of packageReports) {
    const statusIcon = report.error ? '❌' : report.missing ? '⚠️' : '✅';
    markdown += `### ${statusIcon} ${report.package}\n\n`;

    if (report.error) {
      markdown += '_Coverage data could not be read - tests may have failed_\n\n';
    } else if (report.missing) {
      markdown += '_No coverage data found - tests may not have run_\n\n';
    }

    markdown += '| Metric | Coverage | Total | Covered |\n';
    markdown += '|--------|----------|-------|--------|\n';

    for (const [metric, data] of Object.entries(report.summary)) {
      if (metric !== 'branchesTrue' && typeof data === 'object') {
        const metricName = metric.charAt(0).toUpperCase() + metric.slice(1);
        const pct = data.total > 0 ? (data.covered / data.total) * 100 : 0;
        markdown += `| ${metricName} | ${pct.toFixed(2)}% | ${data.total} | ${data.covered} |\n`;
      }
    }
    markdown += '\n';
  }

  return markdown;
}

async function main() {
  console.log('🔍 Discovering packages and merging coverage reports...\n');

  // Check if any packages were discovered
  if (packages.length === 0) {
    console.error('❌ No packages with test coverage configuration found!');
    process.exit(1);
  }

  const { merged, packageReports } = mergeCoverageSummaries();

  // Create coverage directory at root
  const coverageDir = join(rootDir, 'coverage');
  if (!existsSync(coverageDir)) {
    mkdirSync(coverageDir, { recursive: true });
  }

  // Write merged JSON summary
  writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify(merged, null, 2));

  // Write package reports for badge generation
  writeFileSync(join(coverageDir, 'package-reports.json'), JSON.stringify(packageReports, null, 2));

  // Write markdown report
  const markdown = generateMarkdownReport(merged, packageReports);
  writeFileSync(join(coverageDir, 'coverage-report.md'), markdown);

  // Console output
  console.log('📊 Coverage Summary:\n');
  console.log(
    `  Lines:      ${merged.total.lines.pct.toFixed(2)}% (${merged.total.lines.covered}/${merged.total.lines.total})`
  );
  console.log(
    `  Statements: ${merged.total.statements.pct.toFixed(2)}% (${merged.total.statements.covered}/${merged.total.statements.total})`
  );
  console.log(
    `  Functions:  ${merged.total.functions.pct.toFixed(2)}% (${merged.total.functions.covered}/${merged.total.functions.total})`
  );
  console.log(
    `  Branches:   ${merged.total.branches.pct.toFixed(2)}% (${merged.total.branches.covered}/${merged.total.branches.total})`
  );

  console.log('\n✅ Coverage reports merged successfully!');
  console.log(`   - JSON: coverage/coverage-summary.json`);
  console.log(`   - Markdown: coverage/coverage-report.md`);

  // Use unified coverage configuration for thresholds
  // Import the configuration (using dynamic import for ESM compatibility)
  const { getMonorepoThresholds } = await import('../coverage.config.js').catch(() => {
    console.warn('⚠️  Coverage config not found, using default thresholds');
    return {
      getMonorepoThresholds: () => ({
        lines: 30,
        statements: 30,
        functions: 40,
        branches: 50,
      }),
    };
  });

  const thresholds = getMonorepoThresholds();

  // Check for critical issues first
  const packagesWithErrors = packageReports.filter((r) => r.error || r.missing);
  if (packagesWithErrors.length > 0) {
    console.error('\n⚠️  Coverage data issues detected:');
    packagesWithErrors.forEach((pkg) => {
      if (pkg.error) {
        console.error(`  ❌ ${pkg.package}: Failed to read coverage data`);
      } else if (pkg.missing) {
        console.error(`  ⚠️  ${pkg.package}: No coverage data found`);
      }
    });

    // Fail if critical packages are missing
    const criticalPackages = ['inkeep-management-api', 'inkeep-execution-api', 'packages/core'];
    const criticalMissing = packagesWithErrors.filter((pkg) =>
      criticalPackages.includes(pkg.package)
    );

    if (criticalMissing.length > 0) {
      console.error('\n❌ Critical packages missing coverage data. Build failed.');
      process.exit(1);
    }
  }

  let failedThresholds = false;
  console.log('\n📏 Checking coverage thresholds...');
  for (const [metric, threshold] of Object.entries(thresholds)) {
    const pct = merged.total[metric].pct;
    if (pct < threshold) {
      console.error(
        `  ❌ ${metric} coverage (${pct.toFixed(2)}%) is below threshold (${threshold}%)`
      );
      failedThresholds = true;
    } else {
      console.log(`  ✅ ${metric} coverage (${pct.toFixed(2)}%) meets threshold (${threshold}%)`);
    }
  }

  if (failedThresholds) {
    console.error('\n❌ Coverage thresholds not met. Build failed.');
    process.exit(1);
  }

  console.log('\n✅ All coverage checks passed!');
}

main();
