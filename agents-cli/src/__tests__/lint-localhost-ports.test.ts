import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_ROOT = join(__dirname, '..');

// types.ts: where LOCAL_REMOTE is defined; url.test.ts: URL formatting fixtures
const EXEMPT_FILES = ['utils/profiles/types.ts', 'utils/__tests__/url.test.ts'];

const PATTERN = /localhost:300[0-9]/g;

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('No hardcoded localhost ports', () => {
  it('should not have hardcoded localhost:300X outside LOCAL_REMOTE definition', () => {
    const files = collectTsFiles(SRC_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (EXEMPT_FILES.some((exempt) => rel === exempt)) continue;

      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

        PATTERN.lastIndex = 0;
        if (PATTERN.test(lines[i])) {
          violations.push(`  ${rel}:${i + 1}  ${lines[i].trim()}`);
        }
      }
    }

    expect(
      violations,
      `Hardcoded localhost ports found. Use LOCAL_REMOTE.api or LOCAL_REMOTE.manageUi from 'utils/profiles' instead:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
