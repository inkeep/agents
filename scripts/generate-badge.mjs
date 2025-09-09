#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function generateBadge(percentage) {
  let color;
  if (percentage >= 90) color = 'brightgreen';
  else if (percentage >= 80) color = 'green';
  else if (percentage >= 70) color = 'yellowgreen';
  else if (percentage >= 60) color = 'yellow';
  else if (percentage >= 50) color = 'orange';
  else color = 'red';

  return `![Coverage](https://img.shields.io/badge/coverage-${percentage.toFixed(1)}%25-${color})`;
}

function main() {
  try {
    const summaryPath = join(rootDir, 'coverage', 'coverage-summary.json');
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

    const coverage = summary.total.lines.pct;
    const badge = generateBadge(coverage);

    // Write badge to file
    writeFileSync(join(rootDir, 'coverage', 'badge.md'), badge);

    console.log(`Badge generated: ${badge}`);
  } catch (error) {
    console.error('Error generating badge:', error.message);
    process.exit(1);
  }
}

main();
