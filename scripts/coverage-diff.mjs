#!/usr/bin/env node

/**
 * Differential Coverage Script
 *
 * Analyzes test coverage specifically for changed lines of code.
 * This helps ensure that new/modified code is properly tested.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (_error) {
    if (!options.ignoreError) {
      console.error(`Command failed: ${command}`);
    }
    return null;
  }
}

/**
 * Get git diff with line numbers for changed files
 */
function getChangedLines(baseBranch = 'main') {
  const diff = exec(`git diff ${baseBranch}...HEAD --unified=0`);

  if (!diff) return {};

  const changedLines = {};
  let currentFile = null;

  diff.split('\n').forEach((line) => {
    // Match file headers
    if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6);
      changedLines[currentFile] = { added: [], removed: [] };
    }
    // Match line number headers (@@ -old +new @@)
    else if (line.startsWith('@@') && currentFile) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const startLine = parseInt(match[1]);
        const lineCount = match[2] ? parseInt(match[2]) : 1;

        // Track the range of changed lines
        for (let i = 0; i < lineCount; i++) {
          changedLines[currentFile].added.push(startLine + i);
        }
      }
    }
  });

  return changedLines;
}

/**
 * Parse LCOV coverage data
 */
function parseLcov(lcovPath) {
  if (!existsSync(lcovPath)) {
    return {};
  }

  const lcov = readFileSync(lcovPath, 'utf8');
  const coverage = {};
  let currentFile = null;

  lcov.split('\n').forEach((line) => {
    if (line.startsWith('SF:')) {
      // Source file
      currentFile = line.substring(3);
      coverage[currentFile] = { lines: {}, functions: {} };
    } else if (line.startsWith('DA:') && currentFile) {
      // Line coverage data (DA:line_number,execution_count)
      const [lineNum, hitCount] = line.substring(3).split(',').map(Number);
      coverage[currentFile].lines[lineNum] = hitCount;
    } else if (line.startsWith('FNDA:') && currentFile) {
      // Function coverage data
      const [hitCount, fnName] = line.substring(5).split(',');
      coverage[currentFile].functions[fnName] = Number(hitCount);
    }
  });

  return coverage;
}

/**
 * Calculate coverage for changed lines
 */
function calculateDiffCoverage(changedLines, coverage) {
  const results = {};
  let totalChanged = 0;
  let totalCovered = 0;

  Object.entries(changedLines).forEach(([file, lines]) => {
    // Skip non-source files
    if (!file.match(/\.(ts|tsx|js|jsx|mjs)$/) || file.includes('.test.')) {
      return;
    }

    const fileCoverage = coverage[file] || { lines: {} };
    const fileChanged = lines.added.length;
    let fileCovered = 0;

    lines.added.forEach((lineNum) => {
      if (fileCoverage.lines[lineNum] > 0) {
        fileCovered++;
      }
    });

    if (fileChanged > 0) {
      results[file] = {
        changed: fileChanged,
        covered: fileCovered,
        uncovered: fileChanged - fileCovered,
        percentage: (fileCovered / fileChanged) * 100,
        uncoveredLines: lines.added.filter(
          (lineNum) => !fileCoverage.lines[lineNum] || fileCoverage.lines[lineNum] === 0
        ),
      };

      totalChanged += fileChanged;
      totalCovered += fileCovered;
    }
  });

  return {
    files: results,
    summary: {
      totalChanged,
      totalCovered,
      totalUncovered: totalChanged - totalCovered,
      percentage: totalChanged > 0 ? (totalCovered / totalChanged) * 100 : 100,
    },
  };
}

/**
 * Generate diff coverage report
 */
function generateDiffReport(diffCoverage) {
  const { files, summary } = diffCoverage;

  let report = '# Differential Coverage Report\n\n';
  report += '## Summary\n\n';
  report += `- **Changed Lines**: ${summary.totalChanged}\n`;
  report += `- **Covered Lines**: ${summary.totalCovered}\n`;
  report += `- **Uncovered Lines**: ${summary.totalUncovered}\n`;
  report += `- **Coverage**: ${summary.percentage.toFixed(1)}%\n\n`;

  if (Object.keys(files).length > 0) {
    report += '## File Details\n\n';

    // Sort files by coverage percentage (ascending, worst first)
    const sortedFiles = Object.entries(files).sort((a, b) => a[1].percentage - b[1].percentage);

    sortedFiles.forEach(([file, data]) => {
      const icon = data.percentage >= 80 ? '✅' : data.percentage >= 60 ? '⚠️' : '❌';

      report += `### ${icon} ${file}\n\n`;
      report += `- Changed lines: ${data.changed}\n`;
      report += `- Covered: ${data.covered} (${data.percentage.toFixed(1)}%)\n`;

      if (data.uncoveredLines.length > 0 && data.uncoveredLines.length <= 10) {
        report += `- Uncovered lines: ${data.uncoveredLines.join(', ')}\n`;
      } else if (data.uncoveredLines.length > 10) {
        report += `- Uncovered lines: ${data.uncoveredLines.slice(0, 10).join(', ')}... (${data.uncoveredLines.length - 10} more)\n`;
      }

      report += '\n';
    });
  }

  // Add recommendations
  report += '## Recommendations\n\n';

  if (summary.percentage < 80) {
    report += '⚠️ **Coverage is below 80% for changed lines**\n\n';
    report += 'Consider adding tests for:\n';

    const worstFiles = Object.entries(files)
      .filter(([_, data]) => data.percentage < 80)
      .sort((a, b) => a[1].percentage - b[1].percentage)
      .slice(0, 5);

    worstFiles.forEach(([file, data]) => {
      report += `- ${file} (${data.percentage.toFixed(1)}% covered)\n`;
    });
  } else {
    report += '✅ **Good coverage for changed lines!**\n';
  }

  return report;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const baseBranch = args[0] || 'main';

  console.log('\n🔍 Analyzing differential coverage...');
  console.log(`   Base branch: ${baseBranch}\n`);

  // Get changed lines
  const changedLines = getChangedLines(baseBranch);
  const changedFileCount = Object.keys(changedLines).length;

  if (changedFileCount === 0) {
    console.log('✅ No changes detected');
    process.exit(0);
  }

  console.log(`Found ${changedFileCount} changed files\n`);

  // Run tests with coverage if not already present
  console.log('📊 Running tests with coverage...\n');
  exec('pnpm test:coverage', { stdio: 'inherit' });

  // Collect all LCOV files
  const packages = [
    'inkeep-management-api',
    'inkeep-execution-api',
    'agent-builder',
    'cli',
    'packages/core',
  ];

  const allCoverage = {};

  packages.forEach((pkg) => {
    const lcovPath = join(rootDir, pkg, 'coverage', 'lcov.info');
    if (existsSync(lcovPath)) {
      console.log(`Reading coverage for ${pkg}...`);
      const pkgCoverage = parseLcov(lcovPath);

      // Merge coverage data, adjusting paths
      Object.entries(pkgCoverage).forEach(([file, data]) => {
        // Normalize file path to be relative to root
        const normalizedPath = file.startsWith('/')
          ? file.substring(rootDir.length + 1)
          : join(pkg, file);

        allCoverage[normalizedPath] = data;
      });
    }
  });

  // Calculate differential coverage
  const diffCoverage = calculateDiffCoverage(changedLines, allCoverage);

  // Generate and display report
  const report = generateDiffReport(diffCoverage);

  // Write report to file
  const reportPath = join(rootDir, 'coverage', 'diff-coverage.md');
  writeFileSync(reportPath, report);

  // Display summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📈 DIFFERENTIAL COVERAGE RESULTS');
  console.log(`${'='.repeat(60)}\n`);

  const { summary } = diffCoverage;
  const percentageFormatted = summary.percentage.toFixed(1);
  const icon = summary.percentage >= 80 ? '✅' : summary.percentage >= 60 ? '⚠️' : '❌';

  console.log(`${icon} Coverage for changed lines: ${percentageFormatted}%`);
  console.log(`   - Changed: ${summary.totalChanged} lines`);
  console.log(`   - Covered: ${summary.totalCovered} lines`);
  console.log(`   - Uncovered: ${summary.totalUncovered} lines\n`);

  console.log(`Full report: ${reportPath}\n`);

  // Set exit code based on threshold
  const threshold = 60; // Minimum coverage for changed lines
  if (summary.percentage < threshold) {
    console.error(
      `❌ Differential coverage (${percentageFormatted}%) is below threshold (${threshold}%)`
    );
    process.exit(1);
  } else {
    console.log(`✅ Differential coverage meets requirements`);
    process.exit(0);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { getChangedLines, calculateDiffCoverage };
