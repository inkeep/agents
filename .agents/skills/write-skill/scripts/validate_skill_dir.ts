#!/usr/bin/env bun
/**
 * validate_skill_dir.ts
 *
 * A lightweight, dependency-free validator for Skill folders.
 *
 * Usage:
 *   bun scripts/validate_skill_dir.ts /path/to/skill-folder
 *
 * Checks:
 * - SKILL.md exists
 * - YAML frontmatter exists and includes name + description (warns if parsing is partial)
 * - name format (lowercase, digits, hyphens; <= 64 chars)
 * - description size (<= 1024 chars) + basic XML-tag guard
 * - warns if SKILL.md exceeds 500 lines
 * - warns on suspicious deep file references (best-effort)
 *
 * This is intentionally conservative and may produce warnings rather than hard failures.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { basename, resolve } from 'path';

type Frontmatter = Record<string, string>;

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const NAME_RE = /^[a-z0-9-]+$/;

function parseFrontmatter(text: string): { data: Frontmatter | null; warnings: string[] } {
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    return {
      data: null,
      warnings: ['Missing YAML frontmatter block (--- ... ---) at top of SKILL.md'],
    };
  }

  const raw = m[1];
  const data: Frontmatter = {};
  const warnings: string[] = [];

  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) {
      i++;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) {
      warnings.push(`Unparsed frontmatter line (expected key: value): ${line}`);
      i++;
      continue;
    }

    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();

    // Handle YAML block scalars (| or > with optional chomping indicators like |-, >+, etc.)
    if (/^[|>][+-]?\s*$/.test(val)) {
      // Collect continuation lines: any line that is indented more than the key line,
      // or is blank (blank lines are preserved in block scalars)
      const blockLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextRaw = lines[i];
        // A non-empty line that isn't indented (starts at column 0 with a non-space char)
        // signals the end of the block scalar
        if (nextRaw.length > 0 && nextRaw[0] !== ' ' && nextRaw[0] !== '\t') {
          break;
        }
        blockLines.push(nextRaw);
        i++;
      }
      val = blockLines.map((l) => l.trimStart()).join('\n').trim();
    } else {
      // Strip surrounding quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1);
      }
      i++;
    }

    data[key] = val;
  }

  return { data, warnings };
}

function validateName(name: string): string[] {
  const errs: string[] = [];

  if (name.length > 64) errs.push(`name too long (${name.length} > 64)`);
  if (!NAME_RE.test(name))
    errs.push('name must match ^[a-z0-9-]+$ (lowercase letters/digits/hyphens only)');
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
    errs.push("name cannot start/end with '-' or contain consecutive '--'");
  }
  if (name.includes('<') || name.includes('>')) {
    errs.push('name should not contain angle brackets / XML-like tags');
  }

  return errs;
}

function validateDescription(desc: string): string[] {
  const errs: string[] = [];

  if (!desc.trim()) errs.push('description must be non-empty');
  if (desc.length > 1024) errs.push(`description too long (${desc.length} > 1024)`);
  // Soft guard for XML/HTML-like tags (best-effort)
  if (/<[^>]+>/.test(desc))
    errs.push('description appears to contain an XML/HTML-like tag; avoid tags in description');

  return errs;
}

function findSuspiciousReferences(skillText: string): string[] {
  const warnings: string[] = [];

  // Markdown links: [text](path)
  const linkRe = /\[[^\]]+]\(([^)]+)\)/g;
  const links: string[] = [];
  for (const match of skillText.matchAll(linkRe)) {
    if (match[1]) links.push(match[1]);
  }

  // Bare-ish paths (very rough): something/something.ext (or nested)
  const pathRe = /\b[\w.-]+\/[\w.\-/]+\b/g;
  const paths: string[] = [];
  for (const match of skillText.matchAll(pathRe)) {
    if (match[0]) paths.push(match[0]);
  }

  const candidates = new Set<string>([...links, ...paths]);

  for (const p of Array.from(candidates).sort()) {
    if (p.startsWith('http://') || p.startsWith('https://')) continue;

    // Skip prose-like "word/word/word" patterns that aren't real file paths.
    // Real paths typically have: a file extension, start with . or ~, contain common
    // directory names, or are multi-segment with path-like structure.
    // Prose alternatives like "pass/fail/blocked" or "P0/P1/P2" lack these signals.
    if (isLikelyProse(p)) continue;

    const segs = p
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s && s !== '.');

    if (segs.length >= 3) {
      warnings.push(`Reference path looks deeply nested (consider one-level-deep refs): ${p}`);
    }
    if (p.includes('\\')) {
      warnings.push(`Reference uses backslashes (prefer forward slashes): ${p}`);
    }
  }

  return warnings;
}

/**
 * Heuristic: distinguish real file paths from prose alternatives like
 * "pass/fail/blocked", "P0/P1/P2", "Quick/Custom/Guided", "YAML/JSON/TOML".
 *
 * A candidate is likely prose if ALL of these are true:
 * - No segment contains a file extension (e.g., .ts, .md, .json)
 * - Doesn't start with . or ~ (relative/home paths)
 * - No segment matches common directory names (src, lib, references, scripts, etc.)
 * - Every segment is a single short word (no dots, no hyphens longer than typical filenames)
 *
 * Returns true if the candidate looks like prose, false if it looks like a real path.
 */
function isLikelyProse(candidate: string): boolean {
  const segs = candidate.split('/').filter(Boolean);
  if (segs.length === 0) return true;

  // Starts with . or ~ → almost certainly a real path
  if (candidate.startsWith('.') || candidate.startsWith('~')) return false;

  // Any segment has a file extension → real path
  const extRe = /\.\w{1,10}$/;
  if (segs.some((s) => extRe.test(s))) return false;

  // Any segment matches common directory names → real path
  const dirNames = new Set([
    'src', 'lib', 'app', 'bin', 'dist', 'build', 'out', 'tmp', 'temp',
    'scripts', 'references', 'templates', 'assets', 'rules', 'config',
    'tests', 'test', '__tests__', 'spec', 'docs', 'node_modules', 'vendor',
    'packages', 'plugins', 'skills', 'agents', 'claude', 'reports',
  ]);
  if (segs.some((s) => dirNames.has(s.toLowerCase()))) return false;

  // If every segment is a short word (<=20 chars) with no dots and no hyphens,
  // it's likely a prose enumeration like "pass/fail/blocked"
  const isShortWord = (s: string) => s.length <= 20 && !s.includes('.') && !/^\d+$/.test(s);
  if (segs.every(isShortWord)) return true;

  return false;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.log('Usage: bun scripts/validate_skill_dir.ts /path/to/skill-folder');
    return 2;
  }

  const skillDir = resolve(args[0]);
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    console.log(`ERROR: Not a directory: ${skillDir}`);
    return 2;
  }

  const skillMdPath = resolve(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    console.log('ERROR: SKILL.md not found');
    return 1;
  }

  const text = readFileSync(skillMdPath, 'utf8');

  const { data: fm, warnings: fmWarnings } = parseFrontmatter(text);
  const errors: string[] = [];
  const warnings: string[] = [...fmWarnings];

  if (!fm) {
    errors.push('Missing or invalid frontmatter (cannot continue validating name/description).');
  } else {
    const name = (fm['name'] ?? '').trim();
    const desc = (fm['description'] ?? '').trim();

    if (!name) {
      errors.push('Missing required frontmatter key: name');
    } else {
      for (const e of validateName(name)) errors.push(`name: ${e}`);

      const dirName = basename(skillDir);
      if (name !== dirName) {
        warnings.push(
          `name '${name}' does not match directory '${dirName}' (recommended to match).`
        );
      }
    }

    if (!desc) {
      errors.push('Missing required frontmatter key: description');
    } else {
      for (const e of validateDescription(desc)) errors.push(`description: ${e}`);
    }
  }

  const lineCount = text.split(/\r?\n/).length;
  if (lineCount > 500) {
    warnings.push(`SKILL.md is ${lineCount} lines (> 500). Consider splitting into references/.`);
  }

  warnings.push(...findSuspiciousReferences(text));

  if (errors.length > 0) {
    console.log('❌ Skill validation FAILED');
    for (const e of errors) console.log(`  - ${e}`);

    if (warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of warnings) console.log(`  - ${w}`);
    }
    return 1;
  }

  console.log('✅ Skill validation PASSED');
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }
  return 0;
}

process.exit(main());
