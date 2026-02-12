/**
 * Pre-upload Sensitive Data Validation
 *
 * Scans DOM text files (produced by capture.ts) for patterns that indicate
 * sensitive data may have leaked through masking. Must pass before uploading
 * screenshots to GitHub.
 *
 * Usage:
 *   npx tsx validate-sensitive.ts --dir ./pr-screenshots
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

interface SensitivePattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'warning';
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // Critical — real secrets
  { name: 'OpenAI API key', pattern: /sk-[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { name: 'Inkeep API key', pattern: /ik_[a-zA-Z0-9]{10,}/g, severity: 'critical' },
  { name: 'Anthropic API key', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g, severity: 'critical' },
  { name: 'Stripe secret key', pattern: /sk_live_[a-zA-Z0-9]{20,}/g, severity: 'critical' },
  { name: 'AWS access key', pattern: /AKIA[A-Z0-9]{16}/g, severity: 'critical' },
  { name: 'GitHub PAT (classic)', pattern: /ghp_[a-zA-Z0-9]{36}/g, severity: 'critical' },
  { name: 'GitHub OAuth token', pattern: /gho_[a-zA-Z0-9]{36}/g, severity: 'critical' },
  { name: 'GitHub App token', pattern: /ghs_[a-zA-Z0-9]{36}/g, severity: 'critical' },
  { name: 'PEM private key', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----/g, severity: 'critical' },
  {
    name: 'DB connection string with password',
    pattern: /postgresql:\/\/[^\s:]+:[^\s@]+@/g,
    severity: 'critical',
  },
  {
    name: 'Bearer token (long)',
    pattern: /Bearer\s+[a-zA-Z0-9._-]{40,}/g,
    severity: 'critical',
  },

  // Warning — might be sensitive
  {
    name: 'JWT token',
    pattern: /eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    severity: 'warning',
  },
  {
    name: 'Bearer token (short)',
    pattern: /Bearer\s+[a-zA-Z0-9._-]{20,39}/g,
    severity: 'warning',
  },
  {
    name: 'Generic secret in assignment',
    pattern: /(?:secret|password|token|api_key|apikey)\s*[:=]\s*["'][^"']{8,}["']/gi,
    severity: 'warning',
  },
];

function scanFile(filePath: string): { critical: string[]; warnings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const critical: string[] = [];
  const warnings: string[] = [];

  for (const { name, pattern, severity } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      const msg = `${name}: ${matches.length} occurrence(s)`;
      if (severity === 'critical') {
        critical.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  return { critical, warnings };
}

function main() {
  const dir = getArg('dir') || './pr-screenshots';

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const textFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.dom-text.txt'));

  if (textFiles.length === 0) {
    console.log('No .dom-text.txt files found. Run capture.ts first.');
    process.exit(0);
  }

  let hasCritical = false;
  let hasWarnings = false;

  for (const file of textFiles) {
    const filePath = path.join(dir, file);
    const { critical, warnings } = scanFile(filePath);

    if (critical.length > 0) {
      console.error(`\n\u274C CRITICAL in ${file}:`);
      for (const msg of critical) {
        console.error(`  ${msg}`);
      }
      hasCritical = true;
    }

    if (warnings.length > 0) {
      console.warn(`\n\u26A0\uFE0F  WARNING in ${file}:`);
      for (const msg of warnings) {
        console.warn(`  ${msg}`);
      }
      hasWarnings = true;
    }

    if (critical.length === 0 && warnings.length === 0) {
      console.log(`\u2713 ${file}: clean`);
    }
  }

  console.log('');

  if (hasCritical) {
    console.error('\u274C Sensitive data detected. Do NOT upload these screenshots to GitHub.');
    console.error(
      'Re-capture with additional --mask-selectors or manually redact before uploading.'
    );
    process.exit(1);
  }

  if (hasWarnings) {
    console.warn('\u26A0\uFE0F  Warnings found. Review the flagged content before uploading.');
    console.warn('These may be false positives. Use judgment before proceeding.');
    process.exit(0);
  }

  console.log('\u2705 All files clean. Safe to upload.');
}

main();
