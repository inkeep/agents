#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

/**
 * Generate color based on coverage percentage with more nuanced thresholds
 */
function getColorForCoverage(percentage, _metric = 'overall') {
  // More granular color coding for better visual feedback
  if (percentage >= 90) return 'brightgreen';
  else if (percentage >= 80) return 'green';
  else if (percentage >= 70) return 'yellowgreen';
  else if (percentage >= 60) return 'yellow';
  else if (percentage >= 50) return 'orange';
  else if (percentage >= 40)
    return 'ff9800'; // deep orange
  else if (percentage >= 30)
    return 'ff5722'; // red-orange
  else return 'red';
}

/**
 * Generate a single metric badge
 */
function generateMetricBadge(label, percentage, metric) {
  const color = getColorForCoverage(percentage, metric);
  const encodedLabel = encodeURIComponent(label);
  const formattedPercentage = percentage.toFixed(1);

  return `![${label}](https://img.shields.io/badge/${encodedLabel}-${formattedPercentage}%25-${color})`;
}

/**
 * Generate a composite badge showing all metrics
 */
function generateCompositeBadge(metrics) {
  const { lines, statements, functions, branches } = metrics;

  // Calculate overall coverage (average of all metrics)
  const overall = (lines.pct + statements.pct + functions.pct + branches.pct) / 4;
  const color = getColorForCoverage(overall);

  // Create a detailed badge label
  const label = 'coverage';
  const details = `L:${lines.pct.toFixed(0)}%25 S:${statements.pct.toFixed(0)}%25 F:${functions.pct.toFixed(0)}%25 B:${branches.pct.toFixed(0)}%25`;

  return `![Coverage](https://img.shields.io/badge/${label}-${details}-${color})`;
}

/**
 * Generate package-specific badge
 */
function generatePackageBadge(packageName, coverage) {
  const shortName = packageName.replace('packages/', '').replace('-', '_');
  const color = getColorForCoverage(coverage);
  const encodedLabel = encodeURIComponent(`${shortName} coverage`);

  return `![${packageName} Coverage](https://img.shields.io/badge/${encodedLabel}-${coverage.toFixed(1)}%25-${color})`;
}

/**
 * Generate markdown with all badges
 */
function generateBadgeMarkdown(summary, packageReports) {
  let markdown = '# Coverage Badges\n\n';

  // Overall coverage badges
  markdown += '## Overall Coverage\n\n';

  // Composite badge
  markdown += `${generateCompositeBadge(summary.total)}\n\n`;

  // Individual metric badges
  markdown += '### By Metric\n\n';
  markdown += `${generateMetricBadge('Lines', summary.total.lines.pct, 'lines')} `;
  markdown += `${generateMetricBadge('Statements', summary.total.statements.pct, 'statements')} `;
  markdown += `${generateMetricBadge('Functions', summary.total.functions.pct, 'functions')} `;
  markdown += `${generateMetricBadge('Branches', summary.total.branches.pct, 'branches')}\n\n`;

  // Package-specific badges
  if (packageReports && packageReports.length > 0) {
    markdown += '## Package Coverage\n\n';

    packageReports.forEach((report) => {
      const lines = report.summary.lines || { pct: 0, total: 0, covered: 0 };
      const coverage = lines.total > 0 ? (lines.covered / lines.total) * 100 : 0;

      // Add status indicator
      const statusIcon = report.error ? '❌ ' : report.missing ? '⚠️ ' : '';
      markdown += `${statusIcon + generatePackageBadge(report.package, coverage)}\n`;
    });
    markdown += '\n';
  }

  // Coverage trend placeholder (for future implementation)
  markdown += '## Coverage Trend\n\n';
  markdown += '_Trend tracking will be available in a future update_\n\n';

  // Last updated timestamp
  markdown += `---\n_Last updated: ${new Date().toISOString()}_\n`;

  return markdown;
}

/**
 * Generate README badge snippet
 */
function generateReadmeBadge(summary) {
  const overall =
    (summary.total.lines.pct +
      summary.total.statements.pct +
      summary.total.functions.pct +
      summary.total.branches.pct) /
    4;

  const badge = `[![Test Coverage](https://img.shields.io/badge/coverage-${overall.toFixed(1)}%25-${getColorForCoverage(overall)})](./coverage/badges.md)`;

  return badge;
}

/**
 * Read package-specific coverage data
 */
function readPackageReports() {
  const reportsPath = join(rootDir, 'coverage', 'package-reports.json');
  if (existsSync(reportsPath)) {
    try {
      return JSON.parse(readFileSync(reportsPath, 'utf8'));
    } catch (error) {
      console.warn('⚠️  Could not read package reports:', error.message);
    }
  }
  return null;
}

function main() {
  try {
    const summaryPath = join(rootDir, 'coverage', 'coverage-summary.json');

    if (!existsSync(summaryPath)) {
      console.error('❌ Coverage summary not found. Run tests with coverage first.');
      process.exit(1);
    }

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const packageReports = readPackageReports();

    // Ensure coverage directory exists
    const coverageDir = join(rootDir, 'coverage');
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    // Generate full badge markdown
    const badgeMarkdown = generateBadgeMarkdown(summary, packageReports);
    writeFileSync(join(coverageDir, 'badges.md'), badgeMarkdown);

    // Generate simple badge for README
    const readmeBadge = generateReadmeBadge(summary);
    writeFileSync(join(coverageDir, 'readme-badge.md'), readmeBadge);

    // Also write individual badge files for CI/CD integration
    const badges = {
      overall: generateCompositeBadge(summary.total),
      lines: generateMetricBadge('Lines', summary.total.lines.pct, 'lines'),
      statements: generateMetricBadge('Statements', summary.total.statements.pct, 'statements'),
      functions: generateMetricBadge('Functions', summary.total.functions.pct, 'functions'),
      branches: generateMetricBadge('Branches', summary.total.branches.pct, 'branches'),
    };

    Object.entries(badges).forEach(([name, badge]) => {
      writeFileSync(join(coverageDir, `badge-${name}.md`), badge);
    });

    console.log('✅ Coverage badges generated successfully!');
    console.log(`   - Full report: coverage/badges.md`);
    console.log(`   - README badge: coverage/readme-badge.md`);
    console.log(`   - Individual badges: coverage/badge-*.md`);

    // Display the README badge for easy copying
    console.log('\n📋 Add this to your README.md:');
    console.log(readmeBadge);
  } catch (error) {
    console.error('❌ Error generating badges:', error.message);
    process.exit(1);
  }
}

main();
